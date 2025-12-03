import dotenv from 'dotenv';

// Load environment variables (quiet mode to suppress promotional messages)
dotenv.config({ quiet: true });

export const config = {
  databases: {
    staging: process.env.STAGING_DB_URL || '',
    production: process.env.PROD_DB_URL || '',
    audit: process.env.AUDIT_DB_URL || ''
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || '',
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || ''
  },
  minApprovals: parseInt(process.env.MIN_APPROVALS || '2'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production'
};

// Validate required config
export function validateConfig() {
  const required = [
    'AUDIT_DB_URL',
    'GITHUB_TOKEN',
    'GITHUB_REPO'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
  }
}

