# Git for SQL - Setup Guide

This guide will walk you through setting up Git for SQL from scratch.

## Step 1: Prerequisites

Ensure you have:
- Node.js 18+ installed
- PostgreSQL installed and running
- A GitHub account
- Git installed

## Step 2: Clone and Install

```bash
git clone <your-repo-url>
cd git-for-sql-poc
yarn install
```

## Step 3: Create PostgreSQL Databases

Create three PostgreSQL databases:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create databases
CREATE DATABASE audit_db;
CREATE DATABASE staging_db;
CREATE DATABASE prod_db;

# Create a user (optional, for security)
CREATE USER sqlexec WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE audit_db TO sqlexec;
GRANT ALL PRIVILEGES ON DATABASE staging_db TO sqlexec;
GRANT ALL PRIVILEGES ON DATABASE prod_db TO sqlexec;

\q
```

## Step 4: Configure Environment Variables

Copy the example environment file and edit it:

```bash
# Create .env file
cat > .env << 'EOF'
# Database URLs
AUDIT_DB_URL=postgresql://sqlexec:your_secure_password@localhost:5432/audit_db
STAGING_DB_URL=postgresql://sqlexec:your_secure_password@localhost:5432/staging_db
PROD_DB_URL=postgresql://sqlexec:your_secure_password@localhost:5432/prod_db

# GitHub Configuration
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=your-org/sql-scripts
GITHUB_WEBHOOK_SECRET=generate_a_random_secret_here

# Session Secret
SESSION_SECRET=another_random_secret_here

# Minimum Approvals
MIN_APPROVALS=2
EOF
```

## Step 5: Generate GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name like "Git for SQL"
4. Select scopes:
   - `repo` (all)
   - `read:org` (if using organization)
5. Click "Generate token"
6. Copy the token and add it to your `.env` file as `GITHUB_TOKEN`

## Step 6: Create GitHub Repository for SQL Scripts

1. Create a new GitHub repository (e.g., `sql-scripts`)
2. Initialize it with the following structure:

```bash
mkdir sql-scripts
cd sql-scripts
git init

# Create flat directory structure
mkdir -p sql
mkdir -p .github

# Create a sample script (defaults to staging)
cat > sql/001-initial-setup.sql << 'EOF'
-- Author: admin@example.com
-- Purpose: Initial database setup
-- TargetDatabase: staging
-- Date: 2025-12-03

SELECT 'Database is ready' as status;
EOF

# Create PR template
cat > .github/PULL_REQUEST_TEMPLATE.md << 'EOF'
# SQL Script Review

## Script Information
**Script Name:** 
**Author:**
**DirectProd:** [ ] Yes [ ] No (bypass staging requirement)

## Purpose
<!-- Describe what this script does -->

## Safety Checklist
- [ ] SQL syntax validated
- [ ] Tested in staging (or will be via staging-first workflow)
- [ ] Rollback plan documented (if needed)
- [ ] Metadata comments included
EOF

# Initialize git and push
git add .
git commit -m "Initial setup"
git remote add origin git@github.com:your-org/sql-scripts.git
git branch -M main
git push -u origin main
```

3. Update your `.env` file with `GITHUB_REPO=your-org/sql-scripts`

## Step 7: Start the Application

```bash
# From the git-for-sql-poc directory
yarn dev
```

The application will:
- Start on `http://localhost:3000`
- Automatically create the audit database schema
- Test database connections

Visit `http://localhost:3000` to see the dashboard.

## Step 8: Configure GitHub Webhook (For Auto-Sync)

### Generate Webhook Secret

```bash
# Generate a random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy this value and update `GITHUB_WEBHOOK_SECRET` in your `.env` file.

### Set Up Ngrok (For Local Development)

If testing locally, use ngrok to expose your local server:

```bash
# Install ngrok if you haven't
# https://ngrok.com/download

# Start ngrok
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Add Webhook to GitHub

1. Go to your SQL scripts repository on GitHub
2. Click **Settings** → **Webhooks** → **Add webhook**
3. **Payload URL**: `https://abc123.ngrok.io/api/webhook/github` (or your production URL)
4. **Content type**: `application/json`
5. **Secret**: Paste your `GITHUB_WEBHOOK_SECRET`
6. **Which events**: Select "Let me select individual events"
   - Check only **Pull requests**
7. Ensure **Active** is checked
8. Click **Add webhook**

### Test the Webhook

1. Create a test PR in your sql-scripts repository:

```bash
cd sql-scripts
git checkout -b test-script

cat > sql/002-test.sql << 'EOF'
-- Author: test@example.com
-- Purpose: Test webhook integration
-- TargetDatabase: staging
-- Date: 2025-12-03

SELECT 'Webhook working!' as message, NOW() as timestamp;
EOF

git add .
git commit -m "Add test script"
git push origin test-script
```

2. Create PR on GitHub
3. Get 2 approvals (or set `MIN_APPROVALS=0` in `.env` for testing)
4. Merge the PR
5. Check your application at `http://localhost:3000` - the script should appear within 30 seconds (or click "🔄 Sync from GitHub")

## Step 9: Production Deployment

### Option 1: Deploy to Render/Railway/Fly.io

1. Create account on your chosen platform
2. Connect your Git repository
3. Set environment variables from your `.env` file
4. Deploy!
5. Update GitHub webhook URL to your production URL

### Option 2: Deploy to VPS

1. SSH into your server
2. Clone the repository
3. Install Node.js and yarn
4. Copy `.env` file with production values
5. Build and start:

```bash
yarn install
yarn build
NODE_ENV=production yarn start
```

6. Set up nginx/Apache as reverse proxy
7. Use PM2 or systemd to keep it running
8. Update GitHub webhook to your domain

## Step 10: Test the Staging-First Workflow

1. Create a new branch in your sql-scripts repo
2. Add a SQL file to `sql/`:

```sql
-- Author: you@example.com
-- Purpose: Test staging-first workflow
-- TargetDatabase: staging
-- Date: 2025-12-03

SELECT 'Testing workflow!' as message, COUNT(*) as user_count FROM users;
```

3. Create a PR, get 2+ approvals, and merge
4. In the web UI:
   - Script appears in "Pending Staging Execution"
   - Execute on Staging first
   - Script moves to "Ready for Production"
   - Execute on Production
   - Script moves to "Completed"
5. Check execution history to see both runs!

**Optional: DirectProd Flag**
To bypass staging requirement, add `-- DirectProd` to the script comments.

## Troubleshooting

### Database Connection Fails

```bash
# Test connection manually
psql postgresql://sqlexec:password@localhost:5432/audit_db

# If it fails, check:
# - PostgreSQL is running: pg_isready
# - Port 5432 is open
# - User credentials are correct
# - Database exists: psql -l
```

### Webhook Not Receiving Events

1. Check GitHub webhook deliveries (Settings → Webhooks → Recent Deliveries)
2. Verify ngrok is running (for local dev)
3. Check server logs for errors
4. Verify webhook secret matches
5. Ensure `/api/webhook/github` route is accessible

### Scripts Not Appearing After PR Merge

1. Wait 30 seconds for auto-refresh (or click "🔄 Sync from GitHub")
2. Check server logs for webhook processing
3. Verify PR had required approvals
4. Ensure SQL files end with `.sql` extension
5. Verify GitHub token has correct permissions
6. Check files are not in `.gitignore`

## Security Best Practices

1. **Use separate database users** with limited permissions
2. **Enable SSL** for PostgreSQL connections in production
3. **Rotate secrets** regularly
4. **Limit GitHub token** to only required permissions
5. **Use environment variables** never commit secrets
6. **Enable 2FA** on GitHub accounts with access
7. **Review audit logs** regularly
8. **Backup databases** before running production scripts

## Next Steps

- Add user authentication
- Implement role-based access control
- Add email notifications
- Create Slack integration
- Build dry-run mode
- Add script scheduling

Happy SQL executing! 🚀

