import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { getApprovedScripts, getExistingScriptNames, getScriptExecutionHistory } from "~/lib/db.server";
import { syncScriptsFromGitHub } from "~/lib/github.server";
import { addApprovedScript } from "~/lib/audit.server";
import { config } from "~/config.server";
import type { ApprovedScript } from "~/lib/types";

export async function loader({ request }: LoaderFunctionArgs) {
  // Load scripts from database
  const scripts = await getApprovedScripts();
  
  // Get execution stats for each script
  const scriptsWithStats = await Promise.all(
    scripts.map(async (script) => {
      const history = await getScriptExecutionHistory(script.script_name);
      const successfulExecutions = history.filter(e => e.status === 'success');
      const lastExecution = history[0] || null;
      const executionCount = history.length;
      
      // Determine workflow state for sorting
      let workflowState: 'pending' | 'ready' | 'completed' = 'pending';
      if (script.production_executed) {
        workflowState = 'completed';
      } else if (script.staging_executed) {
        workflowState = 'ready';
      }
      
      return {
        ...script,
        executionCount,
        lastExecution,
        lastExecutedBy: lastExecution?.executed_by || null,
        lastExecutedAt: lastExecution?.executed_at || null,
        hasErrors: history.some(e => e.status === 'error'),
        workflowState
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
    
    if (a.workflowState === 'pending') {
      // Pending: sort by approved_at (newest approved first)
      aTime = new Date(a.approved_at).getTime();
      bTime = new Date(b.approved_at).getTime();
    } else if (a.workflowState === 'ready') {
      // Ready for prod: sort by staging_executed_at (newest staging execution first)
      aTime = a.staging_executed_at ? new Date(a.staging_executed_at).getTime() : 0;
      bTime = b.staging_executed_at ? new Date(b.staging_executed_at).getTime() : 0;
    } else {
      // Completed: sort by production_executed_at (newest production execution first)
      aTime = a.production_executed_at ? new Date(a.production_executed_at).getTime() : 0;
      bTime = b.production_executed_at ? new Date(b.production_executed_at).getTime() : 0;
    }
    
    return bTime - aTime; // Newest first
  });
  
  // Group scripts by workflow state
  const pending = scriptsWithStats.filter(s => s.workflowState === 'pending');
  const readyForProd = scriptsWithStats.filter(s => s.workflowState === 'ready');
  const completed = scriptsWithStats.filter(s => s.workflowState === 'completed');
  
  return json({ pending, readyForProd, completed });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "sync") {
    try {
      const stats = await syncScriptsFromGitHub(
        addApprovedScript,
        getExistingScriptNames,
        config.minApprovals
      );
      return json({ 
        success: true, 
        message: `Sync complete: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`,
        stats 
      });
    } catch (error: any) {
      return json({ 
        success: false, 
        error: error.message || "Sync failed" 
      }, { status: 500 });
    }
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function Index() {
  const { pending, readyForProd, completed } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  const totalScripts = pending.length + readyForProd.length + completed.length;

  // Auto-refresh every 30 seconds to pick up new scripts from webhooks
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
      setLastRefresh(new Date());
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [revalidator]);

  // Update last refresh time when data changes
  useEffect(() => {
    setLastRefresh(new Date());
  }, [pending.length, readyForProd.length, completed.length]);

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
              Approved SQL Scripts
            </h2>
            {revalidator.state === 'idle' && (
              <span 
                style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title={`Auto-refreshes every 30 seconds. Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
              >
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                Auto-refresh
              </span>
            )}
            {revalidator.state === 'loading' && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                🔄 Refreshing...
              </span>
            )}
          </div>
          <p style={{ color: '#6b7280' }}>
            All scripts must be executed in staging first, then can be promoted to production. 
            Add <code>-- DirectProd</code> in script comments to bypass staging requirement.
          </p>
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="action" value="sync" />
          <button 
            type="submit" 
            className="btn btn-secondary"
            disabled={fetcher.state === "submitting"}
            style={{ whiteSpace: 'nowrap' }}
          >
            {fetcher.state === "submitting" ? "Syncing..." : "🔄 Sync from GitHub"}
          </button>
        </fetcher.Form>
      </div>

      {fetcher.data && (
        <div 
          className="card" 
          style={{ 
            marginBottom: '1rem',
            backgroundColor: fetcher.data.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${fetcher.data.success ? '#86efac' : '#fca5a5'}`
          }}
        >
          <p style={{ color: fetcher.data.success ? '#166534' : '#991b1b', margin: 0 }}>
            {fetcher.data.message || fetcher.data.error}
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#f59e0b' }}>
            ⏳ Pending Staging Execution ({pending.length})
          </h3>
          <div>
            {pending.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
          </div>
        </div>
      )}

      {readyForProd.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#3b82f6' }}>
            ✅ Ready for Production ({readyForProd.length})
          </h3>
          <div>
            {readyForProd.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#10b981' }}>
            ✓ Completed ({completed.length})
          </h3>
          <div>
            {completed.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
          </div>
        </div>
      )}

      {totalScripts === 0 && (
        <div className="card">
          <p style={{ color: '#6b7280' }}>No scripts available</p>
        </div>
      )}
    </div>
  );
}

function ScriptCard({ script }: { script: any }) {
  const approvers = Array.isArray(script.approvers) 
    ? script.approvers 
    : (script.approvers ? JSON.parse(script.approvers as any) : []);

  // Format relative time
  const formatRelativeTime = (date: Date | string | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            {script.script_name}
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {/* Execution Status Badges */}
            {script.staging_executed && (
              <span className="badge badge-success" title={script.staging_executed_at ? `Staging executed ${formatRelativeTime(script.staging_executed_at)}` : 'Staging executed'}>
                ✓ Staging
              </span>
            )}
            {script.production_executed && (
              <span className="badge badge-success" title={script.production_executed_at ? `Production executed ${formatRelativeTime(script.production_executed_at)}` : 'Production executed'}>
                ✓ Production
              </span>
            )}
            {!script.staging_executed && !script.production_executed && (
              <span className="badge badge-warning">
                ⏳ Pending Staging
              </span>
            )}
            {script.staging_executed && !script.production_executed && (
              <span className="badge badge-info">
                ✅ Ready for Prod
              </span>
            )}
            
            {/* Feature Flags */}
            {script.direct_prod && (
              <span className="badge" style={{ background: '#fbbf24', color: '#78350f' }} title="Can execute directly on production">
                ⚡ DirectProd
              </span>
            )}
            
            {/* Approval Info */}
            {approvers.length > 0 && (
              <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3' }} title={`Approved by: ${approvers.join(', ')}`}>
                👥 {approvers.length} approver{approvers.length !== 1 ? 's' : ''}
              </span>
            )}
            
            {/* Execution Stats */}
            {script.executionCount > 0 && (
              <span className="badge" style={{ background: '#f3f4f6', color: '#374151' }} title={`Executed ${script.executionCount} time${script.executionCount !== 1 ? 's' : ''}`}>
                🔄 {script.executionCount}x
              </span>
            )}
            
            {/* Error Indicator */}
            {script.hasErrors && (
              <span className="badge badge-error" title="Has execution errors">
                ⚠️ Errors
              </span>
            )}
            
            {/* Last Execution Info */}
            {script.lastExecutedAt && (
              <span className="badge" style={{ background: '#fef3c7', color: '#78350f' }} title={`Last executed ${formatRelativeTime(script.lastExecutedAt)} by ${script.lastExecutedBy}`}>
                🕒 {formatRelativeTime(script.lastExecutedAt)}
              </span>
            )}
            
            {/* Approved Date */}
            {script.approved_at && (
              <span className="badge" style={{ background: '#ecfdf5', color: '#065f46' }} title={`Approved ${formatRelativeTime(script.approved_at)}`}>
                📅 Approved {formatRelativeTime(script.approved_at)}
              </span>
            )}
          </div>
          {script.github_pr_url && (
            <a
              href={script.github_pr_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}
            >
              View PR →
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a href={`/scripts/${script.id}`} className="btn btn-primary">
            View Details
          </a>
        </div>
      </div>
      
      <details>
        <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Show SQL
        </summary>
        <pre style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>{script.script_content}</pre>
      </details>
      
      {approvers.length > 0 && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
          <strong>Approved by:</strong> {approvers.join(', ')}
        </div>
      )}
    </div>
  );
}

