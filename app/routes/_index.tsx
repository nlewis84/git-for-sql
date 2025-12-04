import { redirect } from "react-router";
import { json } from "~/lib/json.server";
import {
  useLoaderData,
  useRevalidator,
  useFetcher,
  useNavigation,
} from "react-router";
import { useEffect, useState } from "react";
import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  MagnifyingGlass,
  Clock,
  CheckCircle,
  Check,
  Warning,
  Calendar,
  User,
  ArrowClockwise,
  Lightning,
} from "phosphor-react";
import { getApprovedScripts, getScriptExecutionHistory } from "~/lib/db.server";
import type { ApprovedScript } from "~/lib/types";
import { getUserFromSession } from "~/lib/auth.server";
import { getOpenPRsWithSQL } from "~/lib/github.server";
import { ErrorBoundary } from "~/components/ErrorBoundary";

type LoaderData = {
  pending: Array<
    ApprovedScript & {
      executionCount: number;
      lastExecution: any;
      lastExecutedBy: string | null;
      lastExecutedAt: string | null;
      hasErrors: boolean;
      workflowState: "pending" | "ready" | "completed";
    }
  >;
  readyForProd: Array<
    ApprovedScript & {
      executionCount: number;
      lastExecution: any;
      lastExecutedBy: string | null;
      lastExecutedAt: string | null;
      hasErrors: boolean;
      workflowState: "pending" | "ready" | "completed";
    }
  >;
  completed: Array<
    ApprovedScript & {
      executionCount: number;
      lastExecution: any;
      lastExecutedBy: string | null;
      lastExecutedAt: string | null;
      hasErrors: boolean;
      workflowState: "pending" | "ready" | "completed";
    }
  >;
  openPRs: Array<{
    prNumber: number;
    title: string;
    url: string;
    author: string;
    createdAt: string;
    sqlFiles: Array<{ filename: string; status: string }>;
  }>;
  user: {
    username: string;
    name?: string;
    email?: string;
    avatar?: string;
  } | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication
  const user = await getUserFromSession(request);
  if (!user) {
    throw redirect("/login");
  }

  // Load scripts from database
  const scripts = await getApprovedScripts();

  // Get execution stats for each script
  const scriptsWithStats = await Promise.all(
    scripts.map(async (script) => {
      const history = await getScriptExecutionHistory(script.script_name);
      const successfulExecutions = history.filter(
        (e) => e.status === "success"
      );
      const lastExecution = history[0] || null;
      const executionCount = history.length;

      // Determine workflow state for sorting
      let workflowState: "pending" | "ready" | "completed" = "pending";
      if (script.production_executed) {
        workflowState = "completed";
      } else if (script.staging_executed) {
        workflowState = "ready";
      }

      return {
        ...script,
        executionCount,
        lastExecution,
        lastExecutedBy: lastExecution?.executed_by || null,
        lastExecutedAt: lastExecution?.executed_at || null,
        hasErrors: history.some((e) => e.status === "error"),
        workflowState,
      };
    })
  );

  // Sort scripts: pending first, then ready for prod, then completed
  // Within each group, sort by most relevant timestamp (newest first)
  scriptsWithStats.sort((a, b) => {
    const stateOrder = { pending: 0, ready: 1, completed: 2 };
    const stateDiff = stateOrder[a.workflowState] - stateOrder[b.workflowState];
    if (stateDiff !== 0) return stateDiff;

    // Within same state, sort by most relevant timestamp (newest first)
    let aTime: number;
    let bTime: number;

    if (a.workflowState === "pending") {
      // Pending: sort by approved_at (newest approved first)
      aTime = new Date(a.approved_at).getTime();
      bTime = new Date(b.approved_at).getTime();
    } else if (a.workflowState === "ready") {
      // Ready for prod: sort by staging_executed_at (newest staging execution first)
      aTime = a.staging_executed_at
        ? new Date(a.staging_executed_at).getTime()
        : 0;
      bTime = b.staging_executed_at
        ? new Date(b.staging_executed_at).getTime()
        : 0;
    } else {
      // Completed: sort by production_executed_at (newest production execution first)
      aTime = a.production_executed_at
        ? new Date(a.production_executed_at).getTime()
        : 0;
      bTime = b.production_executed_at
        ? new Date(b.production_executed_at).getTime()
        : 0;
    }

    return bTime - aTime; // Newest first
  });

  // Group scripts by workflow state
  const pending: typeof scriptsWithStats = scriptsWithStats.filter(
    (s) => s.workflowState === "pending"
  );
  const readyForProd: typeof scriptsWithStats = scriptsWithStats.filter(
    (s) => s.workflowState === "ready"
  );
  const completed: typeof scriptsWithStats = scriptsWithStats.filter(
    (s) => s.workflowState === "completed"
  );

  // Fetch open PRs with SQL files (for "In Review" column)
  // This is fetched fresh on every loader call (including auto-refresh)
  let openPRs: Array<{
    prNumber: number;
    title: string;
    url: string;
    author: string;
    createdAt: string;
    sqlFiles: Array<{ filename: string; status: string }>;
  }> = [];
  try {
    openPRs = await getOpenPRsWithSQL();
  } catch (error) {
    console.error("[Dashboard] Error fetching open PRs:", error);
    // Continue with empty array if PR fetch fails
  }

  return json(
    { pending, readyForProd, completed, openPRs, user },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

// Meta tags for SEO
export const meta: MetaFunction = () => {
  return [
    { title: "Dashboard - Git for SQL" },
    {
      name: "description",
      content: "Manage approved SQL scripts with GitHub integration",
    },
  ];
};

// Export ErrorBoundary for this route
export { ErrorBoundary } from "~/components/ErrorBoundary";

// Export shouldRevalidate for better cache control
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: any) {
  // Always revalidate after mutations (POST, PUT, DELETE)
  if (formMethod && formMethod !== "GET") {
    return true;
  }
  // Use default behavior for GET requests
  return defaultShouldRevalidate;
}

export default function Index() {
  const data = useLoaderData<LoaderData>();
  const { pending, readyForProd, completed, openPRs, user } = data;
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  // Show loading state during navigation
  const isLoading = navigation.state === "loading";

  const totalScripts = pending.length + readyForProd.length + completed.length;

  // Auto-refresh every 30 seconds to pick up new scripts from webhooks
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [revalidator]);

  const syncFetcher = useFetcher();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isProcessingSync, setIsProcessingSync] = useState(false);

  const handleSync = () => {
    if (syncFetcher.state === "idle" && !isProcessingSync) {
      setIsProcessingSync(true);
      syncFetcher.submit({}, { method: "POST", action: "/api/sync" });
    }
  };

  useEffect(() => {
    // Only process if we have new data and we're not already processing
    if (syncFetcher.data && syncFetcher.state === "idle" && isProcessingSync) {
      setIsProcessingSync(false);

      if (syncFetcher.data.success) {
        const stats = syncFetcher.data.stats;
        setSyncMessage(
          `Synced ${stats.synced} script(s), skipped ${stats.skipped}, ${stats.errors} error(s)`
        );
        // Refresh data after a short delay to allow the sync to complete
        setTimeout(() => {
          revalidator.revalidate();
        }, 500);
        setTimeout(() => setSyncMessage(null), 5000);
      } else {
        setSyncMessage("Sync failed. Please try again.");
        setTimeout(() => setSyncMessage(null), 5000);
      }
    }
  }, [syncFetcher.data, syncFetcher.state, isProcessingSync, revalidator]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Approved SQL Scripts</h2>
          <p className="text-neutral-500 text-sm">
            All scripts must be executed in staging first, then can be promoted
            to production. Add{" "}
            <code className="bg-warning-100 text-warning-900 px-2 py-1 rounded text-xs font-mono font-semibold">
              -- DirectProd
            </code>{" "}
            in script comments to bypass staging requirement.
          </p>
        </div>
        <syncFetcher.Form method="post" action="/api/sync">
          <button
            type="submit"
            disabled={syncFetcher.state === "submitting"}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-300 hover:border-neutral-400 rounded-lg bg-white hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <ArrowClockwise
              size={16}
              weight="regular"
              className={
                syncFetcher.state === "submitting" ? "animate-spin" : ""
              }
            />
            {syncFetcher.state === "submitting" ? "Syncing..." : "Sync"}
          </button>
        </syncFetcher.Form>
      </div>

      {syncMessage && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            syncMessage.includes("failed")
              ? "bg-error-100 text-error-900"
              : "bg-success-100 text-success-900"
          }`}
        >
          {syncMessage}
        </div>
      )}

      {totalScripts === 0 && openPRs.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          <p className="text-neutral-500">No scripts available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* In Review Column */}
          <div className="flex flex-col max-h-[calc(100vh-250px)]">
            <div className="flex items-center gap-2 mb-6 flex-shrink-0">
              <MagnifyingGlass
                size={20}
                weight="regular"
                className="text-purple-500"
              />
              <h3 className="text-lg font-semibold text-neutral-900">
                In Review
              </h3>
              <span className="bg-purple-100 text-purple-900 text-xs font-semibold px-2 py-1 rounded-full">
                {openPRs.length}
              </span>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-3">
              {openPRs.length > 0 ? (
                openPRs.map((pr: any) => <PRCard key={pr.prNumber} pr={pr} />)
              ) : (
                <div className="text-neutral-400 text-sm text-center py-8">
                  No open PRs
                </div>
              )}
            </div>
          </div>

          {/* Pending Staging Column */}
          <div className="flex flex-col max-h-[calc(100vh-250px)]">
            <div className="flex items-center gap-2 mb-6 flex-shrink-0">
              <Clock size={20} weight="regular" className="text-warning-500" />
              <h3 className="text-lg font-semibold text-neutral-900">
                Ready for Staging
              </h3>
              <span className="bg-warning-100 text-warning-900 text-xs font-semibold px-2 py-1 rounded-full">
                {pending.length}
              </span>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-3">
              {pending.length > 0 ? (
                pending.map((script: any) => (
                  <KanbanCard
                    key={script.id}
                    script={script}
                    hoverBorderColor="warning-400"
                  />
                ))
              ) : (
                <div className="text-neutral-400 text-sm text-center py-8">
                  No scripts pending
                </div>
              )}
            </div>
          </div>

          {/* Ready for Production Column */}
          <div className="flex flex-col max-h-[calc(100vh-250px)]">
            <div className="flex items-center gap-2 mb-6 flex-shrink-0">
              <CheckCircle
                size={20}
                weight="regular"
                className="text-info-500"
              />
              <h3 className="text-lg font-semibold text-neutral-900">
                Ready for Production
              </h3>
              <span className="bg-info-100 text-info-900 text-xs font-semibold px-2 py-1 rounded-full">
                {readyForProd.length}
              </span>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-3">
              {readyForProd.length > 0 ? (
                readyForProd.map((script: any) => (
                  <KanbanCard
                    key={script.id}
                    script={script}
                    hoverBorderColor="info-400"
                  />
                ))
              ) : (
                <div className="text-neutral-400 text-sm text-center py-8">
                  No scripts ready
                </div>
              )}
            </div>
          </div>

          {/* Completed Column */}
          <div className="flex flex-col max-h-[calc(100vh-250px)]">
            <div className="flex items-center gap-2 mb-6 flex-shrink-0">
              <Check size={20} weight="regular" className="text-success-500" />
              <h3 className="text-lg font-semibold text-neutral-900">
                Completed
              </h3>
              <span className="bg-success-100 text-success-900 text-xs font-semibold px-2 py-1 rounded-full">
                {completed.length}
              </span>
            </div>
            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-3">
              {completed.length > 0 ? (
                completed.map((script: any) => (
                  <KanbanCard
                    key={script.id}
                    script={script}
                    hoverBorderColor="success-400"
                  />
                ))
              ) : (
                <div className="text-neutral-400 text-sm text-center py-8">
                  No scripts completed
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PR Card Component (for In Review column)
function PRCard({ pr }: { pr: any }) {
  // Format relative time
  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-md hover:border-purple-400 transition-all cursor-pointer no-underline"
    >
      <h4 className="text-sm font-semibold text-neutral-900 mb-2 line-clamp-2">
        {pr.title}
      </h4>

      <div className="flex flex-wrap gap-2 mb-2">
        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-900">
          PR #{pr.prNumber}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        {pr.createdAt && (
          <span className="flex items-center gap-1">
            <Calendar size={12} weight="regular" />
            {formatRelativeTime(pr.createdAt)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <User size={12} weight="regular" />
          {pr.author}
        </span>
      </div>
    </a>
  );
}

// Compact Kanban Card Component
function KanbanCard({
  script,
  hoverBorderColor = "primary-400",
}: {
  script: any;
  hoverBorderColor?: string;
}) {
  const approvers = Array.isArray(script.approvers)
    ? script.approvers
    : script.approvers
    ? JSON.parse(script.approvers as any)
    : [];

  // Format relative time
  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  // Get primary status badge
  const getPrimaryStatus = () => {
    if (script.production_executed) {
      return {
        text: "Production",
        icon: <Check size={12} weight="bold" className="inline" />,
        color: "bg-success-100 text-success-900",
      };
    }
    if (script.staging_executed) {
      return {
        text: "Staging",
        icon: <Check size={12} weight="bold" className="inline" />,
        color: "bg-success-100 text-success-900",
      };
    }
    return {
      text: "Ready",
      icon: <Clock size={12} weight="bold" className="inline" />,
      color: "bg-warning-100 text-warning-900",
    };
  };

  const primaryStatus = getPrimaryStatus();
  const hasErrors = script.hasErrors;
  const executionCount = script.executionCount || 0;

  // Map hover border color to Tailwind class
  const hoverBorderClass =
    {
      "warning-400": "hover:border-warning-400",
      "info-400": "hover:border-info-400",
      "success-400": "hover:border-success-400",
      "primary-400": "hover:border-primary-400",
    }[hoverBorderColor] || "hover:border-primary-400";

  return (
    <a
      href={`/scripts/${script.id}`}
      className={`block bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-md ${hoverBorderClass} transition-all cursor-pointer no-underline`}
    >
      <h4 className="text-sm font-semibold text-neutral-900 mb-2 truncate">
        {script.script_name}
      </h4>

      <div className="flex flex-wrap gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${primaryStatus.color}`}
        >
          {primaryStatus.icon}
          {primaryStatus.text}
        </span>

        {script.direct_prod && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-warning-100 text-warning-900">
            <Lightning size={12} weight="regular" />
            DirectProd
          </span>
        )}

        {hasErrors && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-error-100 text-error-900">
            <Warning size={12} weight="regular" />
            Errors
          </span>
        )}

        {executionCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-800">
            <ArrowClockwise size={12} weight="regular" />
            {executionCount}x
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        {script.approved_at && (
          <span className="flex items-center gap-1">
            <Calendar size={12} weight="regular" />
            {formatRelativeTime(script.approved_at)}
          </span>
        )}
        {approvers.length > 0 && (
          <span className="flex items-center gap-1">
            <User size={12} weight="regular" />
            {approvers.length}
          </span>
        )}
      </div>
    </a>
  );
}

// Full Script Card (kept for potential future use or detail views)
function ScriptCard({ script }: { script: any }) {
  const approvers = Array.isArray(script.approvers)
    ? script.approvers
    : script.approvers
    ? JSON.parse(script.approvers as any)
    : [];

  // Format relative time
  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h4 className="text-lg font-semibold mb-2">{script.script_name}</h4>
          <div className="flex gap-2 flex-wrap mb-2">
            {/* Execution Status Badges */}
            {script.staging_executed && (
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-900"
                title={
                  script.staging_executed_at
                    ? `Staging executed ${formatRelativeTime(
                        script.staging_executed_at
                      )}`
                    : "Staging executed"
                }
              >
                <Check size={12} weight="bold" className="inline mr-1" />
                Staging
              </span>
            )}
            {script.production_executed && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-900"
                title={
                  script.production_executed_at
                    ? `Production executed ${formatRelativeTime(
                        script.production_executed_at
                      )}`
                    : "Production executed"
                }
              >
                <Check size={12} weight="bold" className="inline mr-1" />
                Production
              </span>
            )}
            {!script.staging_executed && !script.production_executed && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-warning-100 text-warning-900">
                <Clock size={12} weight="regular" className="inline mr-1" />
                Ready
              </span>
            )}
            {script.staging_executed && !script.production_executed && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-info-100 text-info-900">
                <CheckCircle size={12} weight="bold" className="inline mr-1" />
                Ready for Prod
              </span>
            )}

            {/* Feature Flags */}
            {script.direct_prod && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-warning-100 text-warning-900"
                title="Can execute directly on production"
              >
                <Lightning size={12} weight="bold" className="inline mr-1" />
                DirectProd
              </span>
            )}

            {/* Approval Info */}
            {approvers.length > 0 && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-900"
                title={`Approved by: ${approvers.join(", ")}`}
              >
                <User size={12} weight="regular" className="inline mr-1" />
                {approvers.length} approver
                {approvers.length !== 1 ? "s" : ""}
              </span>
            )}

            {/* Execution Stats */}
            {script.executionCount > 0 && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800"
                title={`Executed ${script.executionCount} time${
                  script.executionCount !== 1 ? "s" : ""
                }`}
              >
                <ArrowClockwise
                  size={12}
                  weight="regular"
                  className="inline mr-1"
                />
                {script.executionCount}x
              </span>
            )}

            {/* Error Indicator */}
            {script.hasErrors && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-error-100 text-error-900"
                title="Has execution errors"
              >
                <Warning size={12} weight="bold" className="inline mr-1" />
                Errors
              </span>
            )}

            {/* Last Execution Info */}
            {script.lastExecutedAt && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-warning-100 text-warning-900"
                title={`Last executed ${formatRelativeTime(
                  script.lastExecutedAt
                )} by ${script.lastExecutedBy}`}
              >
                <Clock size={12} weight="regular" className="inline mr-1" />
                {formatRelativeTime(script.lastExecutedAt)}
              </span>
            )}

            {/* Approved Date */}
            {script.approved_at && (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-900"
                title={`Approved ${formatRelativeTime(script.approved_at)}`}
              >
                <Calendar size={12} weight="regular" className="inline mr-1" />
                Approved {formatRelativeTime(script.approved_at)}
              </span>
            )}
          </div>
          {script.github_pr_url && (
            <a
              href={script.github_pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 text-sm font-medium hover:underline"
            >
              View PR →
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <a
            href={`/scripts/${script.id}`}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded transition-colors no-underline"
          >
            View Details
          </a>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-neutral-500 text-sm mb-2">
          Show SQL
        </summary>
        <pre className="mt-2 text-xs bg-neutral-900 text-neutral-100 p-4 rounded overflow-x-auto">
          {script.script_content}
        </pre>
      </details>

      {approvers.length > 0 && (
        <div className="mt-3 text-sm text-neutral-500">
          <strong>Approved by:</strong> {approvers.join(", ")}
        </div>
      )}
    </div>
  );
}
