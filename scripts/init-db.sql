-- Initialize Git for SQL Audit Database
-- Run this script against your audit database

-- Create sql_execution_log table
CREATE TABLE IF NOT EXISTS sql_execution_log (
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
  approvers JSONB
);

-- Create approved_scripts table
CREATE TABLE IF NOT EXISTS approved_scripts (
  id SERIAL PRIMARY KEY,
  script_name VARCHAR(255) UNIQUE NOT NULL,
  script_content TEXT NOT NULL,
  target_database VARCHAR(50) NOT NULL,
  github_pr_url VARCHAR(500),
  approvers JSONB,
  approved_at TIMESTAMP DEFAULT NOW(),
  executed BOOLEAN DEFAULT false
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_execution_log_executed_at ON sql_execution_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_log_script_name ON sql_execution_log(script_name);
CREATE INDEX IF NOT EXISTS idx_execution_log_status ON sql_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_approved_scripts_executed ON approved_scripts(executed);
CREATE INDEX IF NOT EXISTS idx_approved_scripts_target ON approved_scripts(target_database);

-- Insert a test script (optional - comment out if not needed)
-- INSERT INTO approved_scripts (script_name, script_content, target_database, github_pr_url, approvers, executed)
-- VALUES (
--   'example-test.sql',
--   '-- This is a test script\nSELECT 1 as test;',
--   'staging',
--   'https://github.com/example/sql-scripts/pull/1',
--   '["admin", "reviewer"]'::jsonb,
--   false
-- ) ON CONFLICT (script_name) DO NOTHING;

SELECT 'Git for SQL database initialized successfully!' as status;

