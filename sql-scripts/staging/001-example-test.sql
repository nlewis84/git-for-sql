-- Author: admin@example.com
-- Purpose: Test script for staging database
-- Target: staging
-- Date: 2025-12-03
-- Requires: 2 approvals

-- Create a test table
CREATE TABLE IF NOT EXISTS test_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test data
INSERT INTO test_users (name, email) 
VALUES 
  ('Test User 1', 'test1@example.com'),
  ('Test User 2', 'test2@example.com'),
  ('Test User 3', 'test3@example.com')
ON CONFLICT (email) DO NOTHING;

