import { redirect } from "react-router";
import { json } from "~/lib/json.server";
import {
  useLoaderData,
  useActionData,
  Form,
  useNavigation,
  useRevalidator,
} from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
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
import { getUserFromSession } from "~/lib/auth.server";
import {
  Check,
  Clock,
  CheckCircle,
  Warning,
  Lightning,
  X,
  Info,
} from "phosphor-react";
import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "~/components/Table";
import { DetailsDrawer } from "~/components/DetailsDrawer";
import { LoadingSpinner } from "~/components/LoadingSpinner";

export async function loader({ params, request }: LoaderFunctionArgs) {
  // Require authentication
  const user = await getUserFromSession(request);
  if (!user) {
    throw redirect("/login");
  }

  const scriptId = parseInt(params.id || "0");
  const script = await getScriptById(scriptId);

  if (!script) {
    throw new Response("Script not found", {
      status: 404,
      statusText: "Script not found",
    });
  }

  const history = await getScriptExecutionHistory(script.script_name);

  return json({ script, history, user });
}

export async function action({ request, params }: ActionFunctionArgs) {
  // Require authentication
  const user = await getUserFromSession(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptId = parseInt(params.id || "0");
  const script = await getScriptById(scriptId);

  if (!script) {
    return json({ error: "Script not found" }, { status: 404 });
  }

  // Get form data
  const formData = await request.formData();
  const targetDatabase =
    (formData.get("targetDatabase") as string) || "staging";

  // Use authenticated user's email or username (always available since user is authenticated)
  const executedBy = (user.email || user.username || "unknown").trim();

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
      executedBy: executedBy,
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

type LoaderData = {
  script: NonNullable<Awaited<ReturnType<typeof getScriptById>>>;
  history: Awaited<ReturnType<typeof getScriptExecutionHistory>>;
  user: NonNullable<Awaited<ReturnType<typeof getUserFromSession>>>;
};

type ActionData =
  | { success: true; message: string }
  | { success: false; error: string }
  | undefined;

export default function ScriptDetail() {
  const data = useLoaderData<LoaderData>();
  const { script, history, user } = data;
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetDatabase, setTargetDatabase] = useState<
    "staging" | "production"
  >("staging");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const prevNavigationState = useRef<string>(navigation.state);
  const wasSubmitting = useRef<boolean>(false);

  const openDrawer = (entry: any) => {
    setSelectedEntry(entry);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedEntry(null);
  };

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
      <div className="mb-4">
        <a
          href="/"
          className="text-primary-600 hover:text-primary-700 hover:underline text-sm font-medium"
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-6 mb-4">
        <h2 className="text-2xl font-bold mb-4">{script.script_name}</h2>

        {/* Status Badges and Execution Buttons - Grouped Together */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            {/* Status Badges - Left Side */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary Status Badge - Larger and More Prominent */}
              {productionExecuted && (
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold bg-success-100 text-success-900">
                  <Check size={16} weight="regular" />
                  Production Executed
                </span>
              )}
              {!productionExecuted && stagingExecuted && (
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold bg-info-100 text-info-900">
                  <CheckCircle size={16} weight="regular" />
                  Ready for Production
                </span>
              )}
              {!stagingExecuted && !productionExecuted && (
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold bg-warning-100 text-warning-900">
                  <Clock size={16} weight="regular" />
                  Ready for Staging Execution
                </span>
              )}

              {/* Secondary Status Badges - Smaller */}
              {stagingExecuted && !productionExecuted && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-success-100 text-success-900">
                  <Check size={14} weight="regular" />
                  Staging Executed
                </span>
              )}
              {directProd && (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-warning-100 text-warning-900">
                  <Lightning size={14} weight="regular" />
                  Direct Production Allowed
                </span>
              )}
            </div>

            {/* Execution Buttons - Right Side */}
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={() => {
                  setTargetDatabase("staging");
                  setShowConfirm(true);
                }}
                className="inline-block px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded transition-colors cursor-pointer text-sm"
                disabled={isExecuting}
              >
                {isExecuting ? "Executing..." : "Execute on Staging"}
              </button>
              {canExecuteProduction && (
                <button
                  onClick={() => {
                    setTargetDatabase("production");
                    setShowConfirm(true);
                  }}
                  className="inline-block px-4 py-2 bg-white border-2 border-primary-600 text-primary-600 hover:bg-primary-50 font-medium rounded transition-colors cursor-pointer text-sm"
                  disabled={isExecuting}
                >
                  {isExecuting ? "Executing..." : "Execute on Production"}
                </button>
              )}
              {!canExecuteProduction && !stagingExecuted && (
                <div className="flex items-center gap-2 px-3 py-2 bg-warning-50 border border-warning-200 rounded-lg text-sm text-warning-900">
                  <Warning size={16} weight="regular" />
                  <span>
                    Execute on staging first, or add{" "}
                    <code className="bg-warning-100 text-warning-900 px-2 py-1 rounded text-xs font-mono font-semibold">
                      -- DirectProd
                    </code>{" "}
                    flag to bypass
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Messages */}
          {actionData && (
            <div
              className={`mb-3 p-4 rounded-lg ${
                "success" in actionData && actionData.success
                  ? "bg-success-50 border border-success-200 text-success-900"
                  : "bg-error-50 border border-error-200 text-error-900"
              }`}
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
            <div className="mb-3 p-4 bg-warning-50 border border-warning-200 rounded-lg text-warning-900">
              Executing script... Please wait.
            </div>
          )}
        </div>

        {/* Secondary Metadata - More Subtle */}
        <div className="mb-4 space-y-2">
          {script.github_pr_url && (
            <div>
              <a
                href={script.github_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 hover:underline text-xs font-medium"
              >
                View GitHub PR →
              </a>
            </div>
          )}

          {approvers.length > 0 && (
            <p className="text-xs text-neutral-500">{approvers.join(", ")}</p>
          )}
        </div>

        {/* SQL Script Section - Removed Heading */}
        <div className="mb-4">
          <pre className="bg-neutral-900 text-neutral-100 p-4 rounded-lg overflow-x-auto text-sm">
            {script.script_content}
          </pre>
        </div>
      </div>

      {history.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6 mb-4 mt-6">
          <h3 className="text-lg font-semibold mb-4 text-neutral-900">
            Execution History
          </h3>
          <Table>
            <TableHeader>
              <TableHeaderCell>Executed By</TableHeaderCell>
              <TableHeaderCell>Target</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Rows Affected</TableHeaderCell>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Results</TableHeaderCell>
            </TableHeader>
            <TableBody>
              {history.map((entry: any) => (
                <ExecutionHistoryRow
                  key={entry.id}
                  entry={entry}
                  onOpenDetails={openDrawer}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowConfirm(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-2xl w-[90%] max-h-[90vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2 text-neutral-900 flex items-center gap-2">
                <Warning
                  size={20}
                  weight="regular"
                  className="text-warning-500"
                />
                Confirm Execution
              </h3>
              <p className="text-sm text-neutral-600">
                You are about to execute SQL against the{" "}
                <span className="font-semibold text-neutral-900">
                  {targetDatabase}
                </span>{" "}
                database.
              </p>
            </div>

            {targetDatabase === "production" &&
              !stagingExecuted &&
              directProd && (
                <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Warning
                      size={16}
                      weight="regular"
                      className="text-warning-600"
                    />
                    <strong className="text-sm font-semibold text-warning-900">
                      Direct Production Execution
                    </strong>
                  </div>
                  <p className="text-xs text-warning-800">
                    This script has the{" "}
                    <code className="bg-warning-100 text-warning-900 px-2 py-1 rounded text-xs font-mono font-semibold">
                      -- DirectProd
                    </code>{" "}
                    flag, allowing direct production execution without staging.
                  </p>
                </div>
              )}

            <div className="bg-neutral-50 p-4 rounded-lg mb-6">
              <p className="text-xs font-medium mb-2 text-neutral-600">
                {script.script_name}
              </p>
              <pre className="text-xs bg-neutral-900 text-neutral-100 p-4 rounded overflow-x-auto max-h-64 overflow-y-auto">
                {script.script_content}
              </pre>
            </div>

            <Form method="post">
              <p className="mb-6 text-xs text-neutral-500">
                This action will be logged in the audit trail as{" "}
                <span className="font-medium text-neutral-700">
                  {user?.email || user?.username || "you"}
                </span>
                .
              </p>

              <input
                type="hidden"
                name="targetDatabase"
                value={targetDatabase}
              />

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirm(false);
                  }}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-medium rounded transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded transition-colors text-sm"
                >
                  Yes, Execute on {targetDatabase}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Details Drawer */}
      {selectedEntry && (
        <DetailsDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          entry={selectedEntry}
        />
      )}
    </div>
  );
}

// Component for rendering execution history rows
function ExecutionHistoryRow({
  entry,
  onOpenDetails,
}: {
  entry: any;
  onOpenDetails: (entry: any) => void;
}) {
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
      <span
        className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium bg-warning-50 text-warning-700 border border-warning-200"
        title="This SELECT query returned rows, but results weren't captured (likely executed before result capture feature was added). Re-execute to see results."
      >
        <Warning size={14} weight="bold" />
        Not captured
      </span>
    );
  } else {
    // DDL/DML query - no results expected
    resultDisplay = (
      <span
        className="inline-flex items-center gap-2 text-neutral-500 text-sm"
        title="Results are only available for SELECT queries. DDL/DML queries show row count in 'Rows Affected' column."
      >
        N/A
        <Info size={14} weight="regular" className="text-neutral-400" />
      </span>
    );
  }

  if (!hasResults) {
    return (
      <TableRow>
        <TableCell>{entry.executed_by}</TableCell>
        <TableCell>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              entry.target_database === "production"
                ? "bg-error-100 text-error-900"
                : "bg-info-100 text-info-900"
            }`}
          >
            {entry.target_database}
          </span>
        </TableCell>
        <TableCell>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
              entry.status === "success"
                ? "bg-success-100 text-success-900"
                : "bg-error-100 text-error-900"
            }`}
          >
            {entry.status}
          </span>
        </TableCell>
        <TableCell className="text-neutral-700">
          {entry.rows_affected !== null ? entry.rows_affected : "N/A"}
        </TableCell>
        <TableCell className="text-neutral-600">
          {entry.execution_time_ms ? `${entry.execution_time_ms}ms` : "N/A"}
        </TableCell>
        <TableCell className="text-sm text-gray-600">
          {new Date(entry.executed_at).toLocaleString()}
        </TableCell>
        <TableCell>{resultDisplay}</TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{entry.executed_by}</TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            entry.target_database === "production"
              ? "bg-error-100 text-error-900"
              : "bg-info-100 text-info-900"
          }`}
        >
          {entry.target_database}
        </span>
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            entry.status === "success"
              ? "bg-success-100 text-success-900"
              : "bg-error-100 text-error-900"
          }`}
        >
          {entry.status}
        </span>
      </TableCell>
      <TableCell className="text-gray-700">
        {entry.rows_affected !== null ? entry.rows_affected : "N/A"}
      </TableCell>
      <TableCell className="text-gray-600">
        {entry.execution_time_ms ? `${entry.execution_time_ms}ms` : "N/A"}
      </TableCell>
      <TableCell className="text-sm text-gray-600">
        {new Date(entry.executed_at).toLocaleString()}
      </TableCell>
      <TableCell>
        {resultDisplay || (
          <button
            onClick={() => onOpenDetails(entry)}
            className="text-primary-600 hover:text-primary-700 hover:underline text-sm font-medium"
          >
            Details
          </button>
        )}
      </TableCell>
    </TableRow>
  );
}
