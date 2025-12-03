import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getExecutionHistory } from "~/lib/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  
  const history = await getExecutionHistory(limit);
  
  return json({ history });
}

export default function Executions() {
  const { history } = useLoaderData<typeof loader>();

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          Execution History
        </h2>
        <p style={{ color: '#6b7280' }}>
          Complete audit trail of all SQL executions
        </p>
      </div>

      {history.length === 0 ? (
        <div className="card">
          <p style={{ color: '#6b7280' }}>No execution history yet</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Script</th>
                <th>Database</th>
                <th>Executed By</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Time</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => {
                const approvers = entry.approvers 
                  ? (Array.isArray(entry.approvers) ? entry.approvers : JSON.parse(entry.approvers as any))
                  : [];
                
                return (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ fontWeight: '500' }}>{entry.script_name}</div>
                      {approvers.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Approved by: {approvers.join(', ')}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${entry.target_database === 'production' ? 'badge-error' : 'badge-info'}`}>
                        {entry.target_database}
                      </span>
                    </td>
                    <td>{entry.executed_by}</td>
                    <td>
                      <span className={`badge ${entry.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td>{entry.rows_affected !== null ? entry.rows_affected : 'N/A'}</td>
                    <td>{entry.execution_time_ms ? `${entry.execution_time_ms}ms` : 'N/A'}</td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {new Date(entry.executed_at).toLocaleString()}
                    </td>
                    <td>
                      <details>
                        <summary style={{ cursor: 'pointer', color: '#3b82f6', fontSize: '0.875rem' }}>
                          Details
                        </summary>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                          <pre style={{ maxHeight: '200px', overflow: 'auto' }}>
                            {entry.script_content}
                          </pre>
                          {entry.error_message && (
                            <div style={{ marginTop: '0.5rem', color: '#ef4444' }}>
                              <strong>Error:</strong> {entry.error_message}
                            </div>
                          )}
                          {entry.github_pr_url && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <a 
                                href={entry.github_pr_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: '#3b82f6', textDecoration: 'none' }}
                              >
                                View PR →
                              </a>
                            </div>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

