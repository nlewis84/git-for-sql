-- Author: admin@example.com
-- Purpose: Example production script - Update configuration
-- Target: production
-- Date: 2025-12-03
-- Requires: 2 approvals
-- Rollback: UPDATE config SET value = 'old_value' WHERE key = 'example_key';

-- Update a configuration value
UPDATE config 
SET value = 'new_value', updated_at = NOW() 
WHERE key = 'example_key';

