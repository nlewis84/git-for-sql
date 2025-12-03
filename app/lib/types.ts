export interface ApprovedScript {
  id: number;
  script_name: string;
  script_content: string;
  target_database: "staging" | "production";
  github_pr_url: string | null;
  approvers: string[] | null;
  approved_at: Date;
  staging_executed?: boolean;
  staging_executed_at?: Date | null;
  production_executed?: boolean;
  production_executed_at?: Date | null;
  direct_prod?: boolean;
}

export interface ExecutionLog {
  id: number;
  script_name: string;
  script_content: string;
  executed_by: string;
  executed_at: Date;
  target_database: "staging" | "production";
  status: "success" | "error";
  rows_affected: number | null;
  error_message: string | null;
  execution_time_ms: number | null;
  github_pr_url: string | null;
  approvers: string[] | null;
  result_data?: any[] | null;
}

export interface ExecutionResult {
  success: boolean;
  rowsAffected?: number;
  executionTime?: number;
  error?: string;
  resultRows?: any[];
}

export interface GitHubWebhookPayload {
  action: string;
  pull_request: {
    number: number;
    merged: boolean;
    html_url: string;
    user: {
      login: string;
    };
  };
  repository: {
    full_name: string;
  };
}
