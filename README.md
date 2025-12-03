# Git for SQL - POC

A peer-reviewed SQL execution tool with GitHub integration and comprehensive audit logging.

## Features

- ✅ **Peer Review via GitHub** - Requires 2+ approvals on PRs before scripts become available
- ✅ **Staging-First Workflow** - Scripts must run in staging first, then can be promoted to production
- ✅ **On-Demand Execution** - Run approved SQL when YOU want, not tied to deployments
- ✅ **Full Audit Trail** - Immutable log of every execution with user, timestamp, and results
- ✅ **Result Capture** - SELECT queries display returned rows in execution history
- ✅ **Multi-Environment** - Support for staging and production databases
- ✅ **Safety Confirmations** - Double-confirmation before executing SQL with audit trail
- ✅ **GitHub Webhook Integration** - Auto-sync approved scripts from merged PRs
- ✅ **Auto-Refresh Dashboard** - Automatically polls for new scripts every 30 seconds
- ✅ **DirectProd Flag** - Option to bypass staging requirement for specific scripts

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   GitHub    │      │  Remix App  │      │  PostgreSQL │
│  SQL Repo   │─────▶│  Web UI +   │─────▶│  Databases  │
│   + PRs     │      │  Webhooks   │      │ Staging/Prod│
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Audit DB  │
                     │  (Postgres) │
                     └─────────────┘
```

## Prerequisites

- Node.js 18+
- PostgreSQL databases (staging, production, and audit)
- GitHub repository for SQL scripts
- GitHub personal access token

## Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Database URLs
STAGING_DB_URL=postgresql://user:password@localhost:5432/staging_db
PROD_DB_URL=postgresql://user:password@localhost:5432/prod_db
AUDIT_DB_URL=postgresql://user:password@localhost:5432/audit_db

# GitHub Configuration
GITHUB_TOKEN=ghp_your_token_here
GITHUB_REPO=org/sql-scripts
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Session Configuration
SESSION_SECRET=your_session_secret_here

# Minimum required approvals
MIN_APPROVALS=2
```

### 3. Initialize the Audit Database

The audit database schema will be automatically created on first run. Ensure your `AUDIT_DB_URL` is correct and the database exists.

### 4. Set Up GitHub Repository

Create a GitHub repository with a simple flat structure:

```
sql-scripts/
├── sql/
│   ├── 001-create-users-table.sql
│   ├── 002-add-indexes.sql
│   └── 003-query-users.sql
└── README.md
```

Each SQL file should include metadata in comments:

```sql
-- Author: john@example.com
-- Purpose: Query all active users
-- TargetDatabase: staging
-- Date: 2025-12-03
-- DirectProd (optional - allows direct production execution without staging)

SELECT * FROM users WHERE active = true ORDER BY created_at DESC;
```

**Note:** The `-- TargetDatabase:` comment is optional and defaults to `staging`. The staging-first workflow is enforced by the app, not by folder structure.

### 5. Configure GitHub Webhook

1. Go to your GitHub repository settings
2. Navigate to **Webhooks** → **Add webhook**
3. Set the **Payload URL** to: `https://your-domain.com/api/webhook/github`
4. Set **Content type** to: `application/json`
5. Set the **Secret** to match your `GITHUB_WEBHOOK_SECRET`
6. Select **Let me select individual events** and choose: **Pull requests**
7. Ensure **Active** is checked
8. Click **Add webhook**

### 6. Start the Development Server

```bash
yarn dev
```

The app will be available at `http://localhost:3000`

### 7. Build for Production

```bash
yarn build
yarn start
```

## Usage Workflow

### 1. Create SQL Script

Create a new `.sql` file in your `sql/` folder:

```sql
-- Author: jane@example.com
-- Purpose: Add new feature flag
-- TargetDatabase: staging
-- Date: 2025-12-03

INSERT INTO feature_flags (name, enabled) VALUES ('new_feature', false);
```

**Staging-First Workflow:**
- All scripts run in staging first
- After successful staging execution, they can be promoted to production
- Add `-- DirectProd` comment to bypass staging (use sparingly)

### 2. Create Pull Request

1. Create a new branch
2. Add your SQL file
3. Commit and push
4. Create a Pull Request
5. Request reviews from 2+ team members

### 3. Get Approvals

Have at least 2 team members review and approve your PR. They should verify:
- SQL syntax is correct
- The script is safe to run
- Target database is appropriate
- Rollback plan exists (if needed)

### 4. Merge PR

Once approved, merge the PR to main. The webhook will automatically:
- Detect the merged PR
- Verify it has enough approvals
- Extract SQL files
- Add them to the approved scripts list

### 5. Execute via Web UI

**Staging First:**
1. Navigate to the web interface (auto-refreshes every 30 seconds)
2. Find your script in "Pending Staging Execution" section
3. Click **View Details**
4. Click **Execute on Staging**
5. Enter your name/email and confirm
6. View results

**Then Production:**
1. Script moves to "Ready for Production" section
2. Click **Execute on Production**
3. Enter your name/email and confirm
4. Script moves to "Completed" section

**For SELECT queries:**
- Results are captured and displayed in execution history
- Click "Show (X rows)" to view returned data

### 6. Check Audit Log

Navigate to **Execution History** to see:
- Who executed the script
- Which database (staging/production)
- When it was executed
- How many rows were affected
- Execution time
- Query results (for SELECT queries)
- Any errors

## API Endpoints

### `POST /api/webhook/github`

GitHub webhook endpoint that processes merged PRs.

**Headers:**
- `x-hub-signature-256`: GitHub webhook signature

**Response:**
```json
{
  "message": "Webhook processed successfully",
  "prNumber": 42,
  "approvers": ["user1", "user2"],
  "processedFiles": [...]
}
```

## Database Schema

### `approved_scripts`

Stores approved SQL scripts from GitHub PRs with execution tracking.

```sql
CREATE TABLE approved_scripts (
  id SERIAL PRIMARY KEY,
  script_name VARCHAR(255) UNIQUE NOT NULL,
  script_content TEXT NOT NULL,
  target_database VARCHAR(50) NOT NULL,
  github_pr_url VARCHAR(500),
  approvers JSONB,
  approved_at TIMESTAMP DEFAULT NOW(),
  staging_executed BOOLEAN DEFAULT false,
  staging_executed_at TIMESTAMP,
  production_executed BOOLEAN DEFAULT false,
  production_executed_at TIMESTAMP,
  direct_prod BOOLEAN DEFAULT false
);
```

### `sql_execution_log`

Immutable audit log of all SQL executions with result capture.

```sql
CREATE TABLE sql_execution_log (
  id SERIAL PRIMARY KEY,
  script_name VARCHAR(255) NOT NULL,
  script_content TEXT NOT NULL,
  executed_by VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  target_database VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  rows_affected INTEGER,
  error_message TEXT,
  execution_time_ms INTEGER,
  github_pr_url VARCHAR(500),
  approvers JSONB,
  result_data JSONB
);
```

## Security Considerations

1. **Database Credentials**: Store in environment variables, never commit to Git
2. **Webhook Secret**: Use a strong, random secret for GitHub webhooks
3. **Minimum Approvals**: Set to at least 2 for production scripts
4. **Audit Logging**: All executions are logged and immutable
5. **Connection Pools**: Separate pools for staging/production prevent mistakes
6. **GitHub Token**: Use a token with minimal required permissions

## Troubleshooting

### Webhook not working

- Check webhook secret matches between GitHub and `.env`
- Verify webhook URL is accessible from GitHub
- Check webhook deliveries in GitHub settings for error messages

### Database connection errors

- Verify all database URLs are correct
- Ensure databases exist and are accessible
- Check firewall rules allow connections

### Scripts not appearing

- Wait up to 30 seconds (dashboard auto-refreshes)
- Or click "🔄 Sync from GitHub" for immediate sync
- Verify PR was merged (not just closed)
- Check PR has enough approvals
- Ensure SQL files end with `.sql` extension
- Check server logs for webhook processing errors

## Tech Stack

- **Framework**: Remix (TypeScript)
- **Runtime**: Node.js 18+
- **Package Manager**: yarn
- **Database**: PostgreSQL
- **GitHub Integration**: @octokit/rest, @octokit/webhooks

## License

MIT

## Contributing

This is a POC. For production use, consider adding:
- User authentication/authorization
- Role-based access control
- Script scheduling
- Dry-run mode
- Rollback scripts
- Email notifications
- Slack integration
- More granular permissions

