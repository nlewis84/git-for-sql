import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  Form,
  useNavigation,
  useRevalidator,
} from "@remix-run/react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import {
  getScriptById,
  executeSQL,
  getScriptExecutionHistory,
  canExecuteOnProduction,
  updateScriptExecutionStatus,
} from "~/lib/db.server";
import { logExecution } from "~/lib/audit.server";
import { useState, useEffect, useRef } from "react";
import type { ExecutionLog } from "~/lib/types";

export async function loader({ params }: LoaderFunctionArgs) {
  const scriptId = parseInt(params.id || "0");
  const script = await getScriptById(scriptId);

  if (!script) {
    throw new Response("Script not found", { status: 404 });
  }

  const history = await getScriptExecutionHistory(script.script_name);

  return json({ script, history });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const scriptId = parseInt(params.id || "0");
  const script = await getScriptById(scriptId);

  if (!script) {
    return json({ error: "Script not found" }, { status: 404 });
  }

  // Get form data
  const formData = await request.formData();
  const executedBy = (formData.get("executedBy") as string) || "unknown";
  const targetDatabase =
    (formData.get("targetDatabase") as string) || "staging";

  if (!executedBy || executedBy.trim() === "") {
    return json({
      success: false,
      error: "Executed by field is required",
    });
  }

  // Enforce staging-first workflow (unless direct_prod flag is set)
  if (targetDatabase === "production") {
    const canExecute = await canExecuteOnProduction(scriptId);
    if (!canExecute) {
      return json({
        success: false,
        error:
          "Script must be executed successfully in staging first, or have -- DirectProd flag set",
      });
    }
  }

  // Execute the SQL
  const result = await executeSQL(
    targetDatabase as "staging" | "production",
    script.script_content
  );

  // Log the execution (always log, even on error)
  try {
    await logExecution({
      scriptName: script.script_name,
      scriptContent: script.script_content,
      executedBy: executedBy.trim(),
      targetDatabase: targetDatabase as "staging" | "production",
      status: result.success ? "success" : "error",
      rowsAffected: result.rowsAffected,
      errorMessage: result.error,
      executionTimeMs: result.executionTime,
      githubPrUrl: script.github_pr_url || undefined,
      approvers: Array.isArray(script.approvers) ? script.approvers : [],
      resultData: result.resultRows,
    });
  } catch (logError: any) {
    console.error(`Failed to log execution:`, logError);
    // Continue even if logging fails
  }

  // Update script execution status if successful
  if (result.success) {
    try {
      await updateScriptExecutionStatus(
        scriptId,
        targetDatabase as "staging" | "production"
      );
    } catch (markError: any) {
      console.error(`Failed to update script status:`, markError);
    }
  }

  if (result.success) {
    const hasResults = result.resultRows && result.resultRows.length > 0;
    const resultMsg = hasResults
      ? `Returned ${result.resultRows?.length || 0} row${
          (result.resultRows?.length || 0) !== 1 ? "s" : ""
        }`
      : `${result.rowsAffected || 0} row${
          (result.rowsAffected || 0) !== 1 ? "s" : ""
        } affected`;
    return json({
      success: true,
      message: `Successfully executed. ${resultMsg} in ${result.executionTime}ms`,
    });
  } else {
    return json({
      success: false,
      error: result.error || "Execution failed with unknown error",
    });
  }
}

export default function ScriptDetail() {
  const { script, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [showConfirm, setShowConfirm] = useState(false);
  const [executedBy, setExecutedBy] = useState("");
  const [targetDatabase, setTargetDatabase] = useState<
    "staging" | "production"
  >("staging");
  const prevNavigationState = useRef<string>(navigation.state);
  const wasSubmitting = useRef<boolean>(false);

  const isExecuting = navigation.state === "submitting";

  // Track when we start submitting
  useEffect(() => {
    if (navigation.state === "submitting") {
      wasSubmitting.current = true;
    }
  }, [navigation.state]);

  // Close modal and refresh data when execution completes
  useEffect(() => {
    // Close modal if we were submitting, now idle, and have actionData
    if (
      wasSubmitting.current &&
      navigation.state === "idle" &&
      actionData &&
      showConfirm
    ) {
      wasSubmitting.current = false;
      setShowConfirm(false);
      setExecutedBy("");
      // Refresh loader data to get updated execution status
      if ("success" in actionData && actionData.success) {
        revalidator.revalidate();
      }
    }
  }, [navigation.state, actionData, showConfirm, revalidator]);

  const approvers = Array.isArray(script.approvers)
    ? script.approvers
    : script.approvers
    ? JSON.parse(script.approvers as any)
    : [];

  // Determine workflow state
  const stagingExecuted = script.staging_executed === true;
  const productionExecuted = script.production_executed === true;
  const directProd = script.direct_prod === true;
  const canExecuteProduction = stagingExecuted || directProd;

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <a
          href="/"
          style={{
            color: "#3b82f6",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="card">
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "700",
            marginBottom: "1rem",
          }}
        >
          {script.script_name}
        </h2>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            flexWrap: "wrap",
          }}
        >
          {stagingExecuted && (
            <span className="badge badge-success">✓ Staging Executed</span>
          )}
          {productionExecuted && (
            <span className="badge badge-success">✓ Production Executed</span>
          )}
          {!stagingExecuted && !productionExecuted && (
            <span className="badge badge-warning">
              ⏳ Pending Staging Execution
            </span>
          )}
          {stagingExecuted && !productionExecuted && (
            <span className="badge badge-info">✅ Ready for Production</span>
          )}
          {directProd && (
            <span
              className="badge"
              style={{ background: "#fbbf24", color: "#78350f" }}
            >
              ⚡ Direct Production Allowed
            </span>
          )}
          {approvers.length > 0 && (
            <span
              className="badge"
              style={{ background: "#f3f4f6", color: "#374151" }}
            >
              {approvers.length} approver{approvers.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {script.github_pr_url && (
          <p style={{ marginBottom: "1rem" }}>
            <a
              href={script.github_pr_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#3b82f6", textDecoration: "none" }}
            >
              View GitHub PR →
            </a>
          </p>
        )}

        {approvers.length > 0 && (
          <p
            style={{
              marginBottom: "1rem",
              fontSize: "0.875rem",
              color: "#6b7280",
            }}
          >
            <strong>Approved by:</strong> {approvers.join(", ")}
          </p>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
            }}
          >
            SQL Script
          </h3>
          <pre>{script.script_content}</pre>
        </div>

        {actionData && (
          <div
            className={`alert ${
              "success" in actionData && actionData.success
                ? "alert-success"
                : "alert-error"
            }`}
            style={{ marginBottom: "1rem" }}
          >
            {"success" in actionData && actionData.success
              ? "message" in actionData
                ? actionData.message
                : "Success"
              : `Error: ${
                  "error" in actionData ? actionData.error : "Unknown error"
                }`}
          </div>
        )}

        {isExecuting && (
          <div
            className="alert"
            style={{
              marginBottom: "1rem",
              background: "#fef3c7",
              border: "1px solid #fbbf24",
            }}
          >
            Executing script... Please wait.
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setTargetDatabase("staging");
              setShowConfirm(true);
              setExecutedBy("");
            }}
            className="btn btn-primary"
            disabled={isExecuting}
          >
            {isExecuting ? "Executing..." : "Execute on Staging"}
          </button>
          {canExecuteProduction && (
            <button
              onClick={() => {
                setTargetDatabase("production");
                setShowConfirm(true);
                setExecutedBy("");
              }}
              className="btn btn-danger"
              disabled={isExecuting}
            >
              {isExecuting ? "Executing..." : "Execute on Production"}
            </button>
          )}
          {!canExecuteProduction && !stagingExecuted && (
            <div
              style={{
                padding: "0.5rem",
                background: "#fef3c7",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                color: "#78350f",
              }}
            >
              ⚠️ Execute on staging first, or add <code>-- DirectProd</code>{" "}
              flag to bypass
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h3
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              marginBottom: "1rem",
            }}
          >
            Execution History
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Executed By</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Rows Affected</th>
                  <th>Time</th>
                  <th>Date</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <ExecutionHistoryRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showConfirm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowConfirm(false);
            setExecutedBy("");
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "700",
                marginBottom: "1rem",
                color: "#ef4444",
              }}
            >
              ⚠️ Confirm Execution
            </h3>

            <p style={{ marginBottom: "1rem" }}>
              You are about to execute SQL against the{" "}
              <strong
                style={{
                  color:
                    targetDatabase === "production" ? "#ef4444" : "#3b82f6",
                }}
              >
                {targetDatabase}
              </strong>{" "}
              database.
            </p>

            {targetDatabase === "production" &&
              !stagingExecuted &&
              directProd && (
                <div
                  style={{
                    padding: "0.75rem",
                    background: "#fef3c7",
                    borderRadius: "0.375rem",
                    marginBottom: "1rem",
                  }}
                >
                  <strong>⚠️ Direct Production Execution</strong>
                  <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem" }}>
                    This script has the <code>-- DirectProd</code> flag,
                    allowing direct production execution without staging.
                  </p>
                </div>
              )}

            <div
              style={{
                background: "#f9fafb",
                padding: "1rem",
                borderRadius: "0.375rem",
                marginBottom: "1rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  marginBottom: "0.5rem",
                }}
              >
                Script: {script.script_name}
              </p>
              <pre
                style={{
                  fontSize: "0.75rem",
                  background: "#1f2937",
                  padding: "0.75rem",
                }}
              >
                {script.script_content}
              </pre>
            </div>

            <Form
              method="post"
              onSubmit={(e) => {
                if (!executedBy.trim()) {
                  e.preventDefault();
                  alert("Please enter your name/email for the audit trail");
                  return false;
                }
              }}
            >
              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="executedBy"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    marginBottom: "0.5rem",
                    color: "#374151",
                  }}
                >
                  Your Name / Email (required for audit trail):
                </label>
                <input
                  type="text"
                  id="executedBy"
                  name="executedBy"
                  value={executedBy}
                  onChange={(e) => setExecutedBy(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && executedBy.trim()) {
                      e.preventDefault();
                      const form = e.currentTarget.closest("form");
                      if (form) {
                        form.requestSubmit();
                      }
                    }
                  }}
                  required
                  placeholder="e.g., john@example.com or John Doe"
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <p
                style={{
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                  color: "#6b7280",
                }}
              >
                This action will be logged in the audit trail with your name.
              </p>

              <input
                type="hidden"
                name="targetDatabase"
                value={targetDatabase}
              />

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirm(false);
                    setExecutedBy("");
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${
                    targetDatabase === "production"
                      ? "btn-danger"
                      : "btn-primary"
                  }`}
                  disabled={!executedBy.trim()}
                >
                  Yes, Execute on {targetDatabase}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

// Component for rendering execution history rows with expandable results
function ExecutionHistoryRow({ entry }: { entry: any }) {
  const [showResults, setShowResults] = useState(false);

  // Parse result_data if it's a string (shouldn't happen with JSONB, but handle it)
  let resultData = entry.result_data;
  if (resultData && typeof resultData === "string") {
    try {
      resultData = JSON.parse(resultData);
    } catch (e) {
      resultData = null;
    }
  }

  const hasResults =
    resultData && Array.isArray(resultData) && resultData.length > 0;

  // Check if script content is a SELECT query (to detect if results should have been captured)
  const scriptContent = entry.script_content || "";
  const sqlClean = scriptContent
    .replace(/--.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
    .trim()
    .toUpperCase();
  const isSelectQuery = sqlClean.startsWith("SELECT");

  // Determine result display message
  let resultDisplay;
  if (hasResults) {
    resultDisplay = null; // Will show button
  } else if (isSelectQuery && entry.rows_affected && entry.rows_affected > 0) {
    // SELECT query with rows but no results captured (likely executed before feature was added)
    resultDisplay = (
      <span style={{ color: "#f59e0b", fontSize: "0.875rem" }}>
        Not captured
        <span
          style={{ marginLeft: "0.25rem" }}
          title="This SELECT query returned rows, but results weren't captured (likely executed before result capture feature was added). Re-execute to see results."
        >
          ⚠️
        </span>
      </span>
    );
  } else {
    // DDL/DML query - no results expected
    resultDisplay = (
      <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        N/A
        <span
          style={{ marginLeft: "0.25rem" }}
          title="Results are only available for SELECT queries. DDL/DML queries show row count in 'Rows Affected' column."
        >
          ℹ️
        </span>
      </span>
    );
  }

  if (!hasResults) {
    return (
      <tr>
        <td>{entry.executed_by}</td>
        <td>
          <span
            className={`badge ${
              entry.target_database === "production"
                ? "badge-error"
                : "badge-info"
            }`}
          >
            {entry.target_database}
          </span>
        </td>
        <td>
          <span
            className={`badge ${
              entry.status === "success" ? "badge-success" : "badge-error"
            }`}
          >
            {entry.status}
          </span>
        </td>
        <td>{entry.rows_affected !== null ? entry.rows_affected : "N/A"}</td>
        <td>
          {entry.execution_time_ms ? `${entry.execution_time_ms}ms` : "N/A"}
        </td>
        <td>{new Date(entry.executed_at).toLocaleString()}</td>
        <td>{resultDisplay}</td>
      </tr>
    );
  }

  const parsedResultData = (
    typeof resultData === "string" ? JSON.parse(resultData) : resultData
  ) as any[];
  const columns =
    parsedResultData.length > 0 ? Object.keys(parsedResultData[0]) : [];

  return (
    <>
      <tr>
        <td>{entry.executed_by}</td>
        <td>
          <span
            className={`badge ${
              entry.target_database === "production"
                ? "badge-error"
                : "badge-info"
            }`}
          >
            {entry.target_database}
          </span>
        </td>
        <td>
          <span
            className={`badge ${
              entry.status === "success" ? "badge-success" : "badge-error"
            }`}
          >
            {entry.status}
          </span>
        </td>
        <td>{entry.rows_affected !== null ? entry.rows_affected : "N/A"}</td>
        <td>
          {entry.execution_time_ms ? `${entry.execution_time_ms}ms` : "N/A"}
        </td>
        <td>{new Date(entry.executed_at).toLocaleString()}</td>
        <td>
          <button
            onClick={() => setShowResults(!showResults)}
            style={{
              background: "transparent",
              border: "1px solid #3b82f6",
              color: "#3b82f6",
              padding: "0.25rem 0.5rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            {showResults
              ? "▼ Hide"
              : `▶ Show (${parsedResultData.length} row${
                  parsedResultData.length !== 1 ? "s" : ""
                })`}
          </button>
        </td>
      </tr>
      {showResults && (
        <tr>
          <td colSpan={7} style={{ padding: "1rem", background: "#f9fafb" }}>
            <div
              style={{
                marginBottom: "0.5rem",
                fontWeight: "600",
                fontSize: "0.875rem",
              }}
            >
              Query Results:
            </div>
            <div
              style={{
                overflowX: "auto",
                maxHeight: "400px",
                overflowY: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  fontSize: "0.875rem",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#e5e7eb",
                      position: "sticky",
                      top: 0,
                    }}
                  >
                    {columns.map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "0.5rem",
                          textAlign: "left",
                          border: "1px solid #d1d5db",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedResultData.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: idx % 2 === 0 ? "#ffffff" : "#f9fafb",
                      }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          style={{
                            padding: "0.5rem",
                            border: "1px solid #d1d5db",
                            wordBreak: "break-word",
                          }}
                        >
                          {row[col] !== null && row[col] !== undefined ? (
                            String(row[col])
                          ) : (
                            <span style={{ color: "#9ca3af" }}>NULL</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
