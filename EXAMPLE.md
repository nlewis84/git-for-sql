# Example Workflow

This document shows a complete example of using Git for SQL with the staging-first workflow.

## Scenario

You need to query user data from the production database to generate a report.

## Step 1: Create the SQL Script

Create a new file in your sql-scripts repository:

`sql/003-query-active-users.sql`

```sql
-- Author: john@example.com
-- Purpose: Query active users for monthly report
-- TargetDatabase: staging
-- Date: 2025-12-03
-- Ticket: REPORT-456

-- Query active users with their last login
SELECT 
  id,
  email,
  username,
  first_name,
  last_name,
  created_at,
  updated_at,
  last_login_at
FROM users
WHERE active = true
ORDER BY last_login_at DESC
LIMIT 100;
```

**Note:** The staging-first workflow will require this to run in staging first, then it can be promoted to production.

## Step 2: Create a Branch and PR

```bash
cd sql-scripts
git checkout -b query-active-users-report-456

# Add your file
git add sql/003-query-active-users.sql

# Commit with clear message
git commit -m "Add query for active users report REPORT-456"

# Push to GitHub
git push origin query-active-users-report-456
```

## Step 3: Create Pull Request on GitHub

1. Go to GitHub
2. Click "Compare & pull request"
3. Fill in the PR template:

```markdown
# SQL Script Review

## Script Information
**Script Name:** 003-query-active-users.sql
**Author:** john@example.com
**Workflow:** Staging first, then production
**DirectProd:** No

## Purpose
Query active users for monthly report generation per REPORT-456. Results will be captured and exported to CSV.

## Safety Checklist
- [x] SQL syntax has been validated
- [x] Read-only SELECT query
- [x] Script includes metadata comments
- [x] No PII fields in results (phone numbers, addresses excluded)
- [x] Will test in staging first

## Impact Assessment
**Query type:** SELECT (read-only)
**Estimated rows returned:** ~100
**Estimated execution time:** < 50ms
**Tables accessed:** users

## Rollback Plan
If executed by mistake:
1. Restore from database backup (RDS snapshot from last hour)
2. Or use rollback SQL in script comments (if backup is recent)

## Testing
- [x] Tested locally with test database
- [x] Tested in staging with similar data
- [x] SQL syntax verified with PostgreSQL 14

## Additional Context
- User email: john-test@example.com
- User ID: user-uuid-here
- Support ticket: JIRA-1234
- User has no active subscriptions
- No impact on other users
```

4. Request reviews from at least 2 team members

## Step 4: Code Review

**Reviewer 1 (Sarah):**
```
✅ Approved

Verified:
- Read-only SELECT query (safe)
- No PII exposure concerns
- LIMIT clause prevents runaway results
- Query is efficient with proper indexes

Safe to merge!
```

**Reviewer 2 (Michael):**
```
✅ Approved

Double-checked:
- Staging-first workflow will catch any issues
- Query performance looks good
- Results will be captured automatically
- No risk to production data

Good to go! 👍
```

## Step 5: Merge PR

Once you have 2+ approvals:

1. Click "Merge pull request"
2. Choose "Create a merge commit" or "Squash and merge"
3. Click "Confirm merge"

## Step 6: Webhook Processes PR

Behind the scenes:
1. GitHub sends webhook to your app
2. App verifies signature
3. App checks PR has 2+ approvals ✅
4. App extracts SQL files from PR
5. App adds script to `approved_scripts` table
6. Script appears in web UI within 30 seconds (auto-refresh)!

Check server logs:
```
[Webhook] Processing merged PR #42
[Webhook] PR #42 has 2 approvals (need 2)
[Webhook] Found 1 SQL files after filtering
[Webhook] ✓ Successfully added script: 003-query-active-users.sql
```

## Step 7: Execute in Staging First

1. Navigate to `http://localhost:3000` (or your domain)
2. See the script in the "Pending Staging Execution" section
3. Click "View Details"
4. Review the script
5. Click "Execute on Staging"
6. Confirmation modal appears:

```
⚠️ Confirm Execution

You are about to execute SQL against the staging database.

Script: 003-query-active-users.sql

Your Name / Email (required for audit trail):
[type your email]

[Cancel] [Yes, Execute on staging]
```

7. Enter your email (e.g., `john@example.com`) and press Enter or click "Yes, Execute"

## Step 8: Staging Execution Results

Success message appears:
```
✓ Successfully executed. Returned 100 rows in 23ms
```

The script now has:
- ✅ Staging Executed badge
- Moves to "Ready for Production" section

## Step 9: Execute in Production

1. Click "Execute on Production" (now enabled)
2. Confirmation modal appears for production
3. Enter your email and confirm
4. Success! Script moves to "Completed" section

## Step 9: Verify in Audit Log

1. Navigate to "Execution History"
2. See your execution at the top:

| Script | Database | Executed By | Status | Rows | Time | Date |
|--------|----------|-------------|--------|------|------|------|
| 003-delete-inactive-user.sql | production | john@example.com | success | 3 | 47ms | 2025-12-03 14:23:45 |

3. Click "Details" to see:
   - Full SQL that was executed
   - GitHub PR link
   - Approvers: sarah, michael
   - Timestamp
   - Results

## Step 11: Export Results

You can copy the results from the expanded table or query the audit database:

```sql
-- Check audit log
SELECT executed_by, target_database, rows_affected, result_data
FROM sql_execution_log 
WHERE script_name = '003-query-active-users.sql';

-- Result data is stored as JSONB with full query results
```

## Step 12: Update Report Ticket

```
REPORT-456 - Active Users Monthly Report
Status: Completed

✅ Query executed successfully in staging and production
✅ 100 users returned
✅ Results captured and available in dashboard
✅ Audit trail: http://localhost:3000

Executed: 2025-12-03 14:25:15 UTC
Approved by: sarah, michael
Query time: 23ms
```

## Complete!

The SQL script was:
1. ✅ Peer-reviewed by 2+ people
2. ✅ Merged through GitHub workflow
3. ✅ Tested in staging first (staging-first workflow)
4. ✅ Promoted to production after successful staging run
5. ✅ Executed on-demand (not tied to deployment)
6. ✅ Results captured and viewable in dashboard
7. ✅ Fully logged in audit trail
8. ✅ Verified and documented

## Example: DirectProd Bypass

If you need to bypass the staging requirement (e.g., emergency hotfix):

`sql/004-emergency-fix.sql`

```sql
-- Author: john@example.com
-- Purpose: URGENT - Fix critical production issue
-- TargetDatabase: staging
-- DirectProd
-- Date: 2025-12-03
-- Ticket: HOTFIX-789

UPDATE config SET value = 'fixed' WHERE key = 'broken_setting';
```

The `-- DirectProd` flag allows immediate production execution without running in staging first.

**Use sparingly!** The staging-first workflow catches issues before production.

---

This demonstrates the complete staging-first workflow from SQL creation to execution! 🎉

**Key Benefits:**
- ✅ Staging-first catches errors before production
- ✅ SELECT queries capture and display results
- ✅ Full audit trail with who executed what and where
- ✅ Auto-refresh dashboard (30s polling)
- ✅ DirectProd bypass available for emergencies

