import { pools } from "./db.server";

export interface LogExecutionData {
  scriptName: string;
  scriptContent: string;
  executedBy: string;
  targetDatabase: "staging" | "production";
  status: "success" | "error";
  rowsAffected?: number;
  errorMessage?: string;
  executionTimeMs?: number;
  githubPrUrl?: string;
  approvers?: string[];
  resultData?: any[];
}

// Log SQL execution to audit table
export async function logExecution(data: LogExecutionData): Promise<void> {
  try {
    await pools.audit.query(
      `INSERT INTO sql_execution_log 
       (script_name, script_content, executed_by, target_database, 
        status, rows_affected, error_message, execution_time_ms, 
        github_pr_url, approvers, result_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        data.scriptName,
        data.scriptContent,
        data.executedBy,
        data.targetDatabase,
        data.status,
        data.rowsAffected || null,
        data.errorMessage || null,
        data.executionTimeMs || null,
        data.githubPrUrl || null,
        data.approvers ? JSON.stringify(data.approvers) : null,
        data.resultData ? JSON.stringify(data.resultData) : null,
      ]
    );
    console.log(`✓ Logged execution of ${data.scriptName}`);
  } catch (error) {
    console.error("Error logging execution:", error);
  }
}

// Add approved script to database
export async function addApprovedScript(data: {
  scriptName: string;
  scriptContent: string;
  targetDatabase: "staging" | "production";
  githubPrUrl: string;
  approvers: string[];
  directProd?: boolean;
}): Promise<boolean> {
  try {
    await pools.audit.query(
      `INSERT INTO approved_scripts 
       (script_name, script_content, target_database, github_pr_url, approvers, direct_prod)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (script_name) 
       DO UPDATE SET 
         script_content = EXCLUDED.script_content,
         github_pr_url = EXCLUDED.github_pr_url,
         approvers = EXCLUDED.approvers,
         direct_prod = EXCLUDED.direct_prod,
         approved_at = NOW()`,
      [
        data.scriptName,
        data.scriptContent,
        data.targetDatabase,
        data.githubPrUrl,
        JSON.stringify(data.approvers),
        data.directProd || false,
      ]
    );
    console.log(`✓ Added approved script: ${data.scriptName}`);
    return true;
  } catch (error) {
    console.error("Error adding approved script:", error);
    return false;
  }
}
