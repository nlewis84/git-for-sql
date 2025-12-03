import { Pool } from "pg";
import { config } from "~/config.server";
import type { ExecutionResult, ApprovedScript, ExecutionLog } from "./types";

// Initialize connection pools
export const pools = {
  staging: new Pool({ connectionString: config.databases.staging }),
  production: new Pool({ connectionString: config.databases.production }),
  audit: new Pool({ connectionString: config.databases.audit }),
};

// Test database connections on startup
export async function testConnections() {
  try {
    if (config.databases.audit) {
      await pools.audit.query("SELECT NOW()");
      console.log("✓ Audit database connected");
    }
    if (config.databases.staging) {
      await pools.staging.query("SELECT NOW()");
      console.log("✓ Staging database connected");
    }
    if (config.databases.production) {
      await pools.production.query("SELECT NOW()");
      console.log("✓ Production database connected");
    }
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

// Execute SQL against target database
export async function executeSQL(
  target: "staging" | "production",
  sql: string
): Promise<ExecutionResult> {
  const pool = pools[target];
  const start = Date.now();

  try {
    if (!pool) {
      throw new Error(`No connection pool available for ${target} database`);
    }

    const result = await pool.query(sql);
    const executionTime = Date.now() - start;

    // Check if this is a SELECT query (has result rows)
    // Remove comments and whitespace to detect SELECT queries properly
    const sqlClean = sql
      .replace(/--.*$/gm, "") // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
      .trim()
      .toUpperCase();
    const isSelectQuery = sqlClean.startsWith("SELECT");
    const resultRows =
      isSelectQuery && result.rows && result.rows.length > 0
        ? result.rows
        : undefined;

    // Limit result rows to prevent storing huge result sets (max 100 rows)
    const limitedRows =
      resultRows && resultRows.length > 100
        ? resultRows.slice(0, 100)
        : resultRows;

    // For SELECT queries, use rows.length; for DML/DDL, use rowCount
    const rowsAffected = isSelectQuery
      ? result.rows
        ? result.rows.length
        : 0
      : result.rowCount || 0;

    return {
      success: true,
      rowsAffected,
      executionTime,
      resultRows: limitedRows,
    };
  } catch (error: any) {
    const executionTime = Date.now() - start;
    console.error(
      `SQL execution error after ${executionTime}ms:`,
      error.message
    );

    return {
      success: false,
      error: error.message || "Unknown error occurred",
      executionTime,
    };
  }
}

// Get all approved scripts
export async function getApprovedScripts(): Promise<ApprovedScript[]> {
  try {
    const result = await pools.audit.query(
      `SELECT * FROM approved_scripts ORDER BY approved_at DESC`
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching approved scripts:", error);
    return [];
  }
}

// Get list of existing script names (for sync deduplication)
export async function getExistingScriptNames(): Promise<string[]> {
  try {
    const result = await pools.audit.query(
      `SELECT script_name FROM approved_scripts`
    );
    return result.rows.map((row) => row.script_name);
  } catch (error) {
    console.error("Error fetching script names:", error);
    return [];
  }
}

// Get script by ID
export async function getScriptById(
  id: number
): Promise<ApprovedScript | null> {
  try {
    const result = await pools.audit.query(
      `SELECT * FROM approved_scripts WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error fetching script:", error);
    return null;
  }
}

// Update script execution status (staging or production)
export async function updateScriptExecutionStatus(
  scriptId: number,
  targetDatabase: "staging" | "production"
): Promise<void> {
  try {
    if (targetDatabase === "staging") {
      await pools.audit.query(
        `UPDATE approved_scripts 
         SET staging_executed = true, staging_executed_at = NOW() 
         WHERE id = $1`,
        [scriptId]
      );
    } else if (targetDatabase === "production") {
      await pools.audit.query(
        `UPDATE approved_scripts 
         SET production_executed = true, production_executed_at = NOW() 
         WHERE id = $1`,
        [scriptId]
      );
    }
  } catch (error) {
    console.error("Error updating script execution status:", error);
  }
}

// Check if script can be executed on production
export async function canExecuteOnProduction(
  scriptId: number
): Promise<boolean> {
  try {
    const result = await pools.audit.query(
      `SELECT staging_executed, direct_prod 
       FROM approved_scripts 
       WHERE id = $1`,
      [scriptId]
    );

    if (result.rows.length === 0) return false;
    const script = result.rows[0];

    // Can execute if: staging was executed successfully OR direct_prod flag is set
    return script.staging_executed === true || script.direct_prod === true;
  } catch (error) {
    console.error("Error checking production execution eligibility:", error);
    return false;
  }
}

// Get execution history
export async function getExecutionHistory(limit = 50): Promise<ExecutionLog[]> {
  try {
    const result = await pools.audit.query(
      `SELECT * FROM sql_execution_log ORDER BY executed_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error("Error fetching execution history:", error);
    return [];
  }
}

// Get execution history for a specific script
export async function getScriptExecutionHistory(
  scriptName: string
): Promise<ExecutionLog[]> {
  try {
    const result = await pools.audit.query(
      `SELECT * FROM sql_execution_log WHERE script_name = $1 ORDER BY executed_at DESC`,
      [scriptName]
    );
    // Parse JSONB fields if they're strings (PostgreSQL sometimes returns JSONB as strings)
    return result.rows.map((row) => {
      if (row.result_data && typeof row.result_data === "string") {
        try {
          row.result_data = JSON.parse(row.result_data);
        } catch (e) {
          // If parsing fails, keep as is
        }
      }
      if (row.approvers && typeof row.approvers === "string") {
        try {
          row.approvers = JSON.parse(row.approvers);
        } catch (e) {
          // If parsing fails, keep as is
        }
      }
      return row;
    });
  } catch (error) {
    console.error("Error fetching script execution history:", error);
    return [];
  }
}

// Initialize database schema
export async function initializeSchema(): Promise<void> {
  const schema = `
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
      approvers JSONB,
      result_data JSONB
    );
    
    -- Add result_data column if it doesn't exist (for existing databases)
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sql_execution_log' AND column_name = 'result_data') THEN
        ALTER TABLE sql_execution_log ADD COLUMN result_data JSONB;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS approved_scripts (
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
    
    -- Add new columns if they don't exist (for existing databases)
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approved_scripts' AND column_name = 'staging_executed') THEN
        ALTER TABLE approved_scripts ADD COLUMN staging_executed BOOLEAN DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approved_scripts' AND column_name = 'staging_executed_at') THEN
        ALTER TABLE approved_scripts ADD COLUMN staging_executed_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approved_scripts' AND column_name = 'production_executed') THEN
        ALTER TABLE approved_scripts ADD COLUMN production_executed BOOLEAN DEFAULT false;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approved_scripts' AND column_name = 'production_executed_at') THEN
        ALTER TABLE approved_scripts ADD COLUMN production_executed_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'approved_scripts' AND column_name = 'direct_prod') THEN
        ALTER TABLE approved_scripts ADD COLUMN direct_prod BOOLEAN DEFAULT false;
      END IF;
    END $$;
  `;

  try {
    await pools.audit.query(schema);
    console.log("✓ Database schema initialized");
  } catch (error) {
    console.error("Error initializing schema:", error);
  }
}
