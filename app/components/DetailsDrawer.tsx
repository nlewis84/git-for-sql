import { X, CheckCircle, XCircle } from "phosphor-react";
import { useEffect } from "react";
import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "~/components/Table";

interface DetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entry: {
    script_name: string;
    script_content: string;
    error_message?: string | null;
    github_pr_url?: string | null;
    approvers?: string[] | any;
    target_database: string;
    executed_by: string;
    executed_at: string;
    status: string;
    rows_affected: number | null;
    execution_time_ms: number | null;
    result_data?: any[] | null;
  };
}

export function DetailsDrawer({ isOpen, onClose, entry }: DetailsDrawerProps) {
  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const approvers = entry.approvers
    ? Array.isArray(entry.approvers)
      ? entry.approvers
      : JSON.parse(entry.approvers as any)
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
        style={{ animation: "fadeIn 0.2s ease-out" }}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full md:w-2/3 bg-white shadow-2xl z-50 overflow-y-auto"
        style={{
          animation: "slideIn 0.3s ease-out",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.15)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-semibold text-gray-900">
            Execution Details
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close drawer"
          >
            <X size={20} weight="bold" className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Script Name - Prominent */}
          <div>
            <p className="text-xl font-semibold text-gray-900 font-mono">
              {entry.script_name}
            </p>
          </div>

          {/* Key Metrics - Large, Prominent */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-gray-500 mb-1">Database</div>
              <div>
                <span
                  className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${
                    entry.target_database === "production"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {entry.target_database}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                {entry.status === "success" ? (
                  <CheckCircle
                    size={16}
                    className="text-green-600"
                    weight="fill"
                  />
                ) : (
                  <XCircle size={16} className="text-red-600" weight="fill" />
                )}
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {entry.status}
                </span>
              </div>
            </div>
            {entry.rows_affected !== null && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Rows Affected</div>
                <div className="text-2xl font-bold text-gray-900">
                  {entry.rows_affected.toLocaleString()}
                </div>
              </div>
            )}
            {entry.execution_time_ms && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Execution Time</div>
                <div className="text-2xl font-bold text-gray-900">
                  {entry.execution_time_ms}ms
                </div>
              </div>
            )}
          </div>

          {/* Details - Subtle, Secondary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div>
              <div className="text-xs text-gray-500 mb-1">Executed By</div>
              <div className="text-sm text-gray-900">{entry.executed_by}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Executed At</div>
              <div className="text-sm text-gray-900">
                {new Date(entry.executed_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Approvers */}
          {approvers.length > 0 && (
            <div className="pt-6">
              <div className="text-xs text-gray-500 mb-2">Approved By</div>
              <div className="flex flex-wrap gap-1.5">
                {approvers.map((approver: string, idx: number) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                  >
                    {approver}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {entry.error_message && (
            <div className="pt-6">
              <div className="bg-red-50 rounded p-4">
                <div className="text-xs font-medium text-red-900 mb-1">
                  Error
                </div>
                <p className="text-sm text-red-700">{entry.error_message}</p>
              </div>
            </div>
          )}

          {/* SQL Script */}
          <div className="pt-6">
            <div className="text-xs text-gray-500 mb-2">SQL Script</div>
            <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto font-mono">
              {entry.script_content}
            </pre>
          </div>

          {/* Query Results */}
          {(() => {
            const resultData = entry.result_data;
            if (
              resultData &&
              Array.isArray(resultData) &&
              resultData.length > 0 &&
              resultData[0]
            ) {
              const firstRow = resultData[0];
              const columns = Object.keys(firstRow);
              return (
                <div className="pt-6">
                  <div className="flex items-baseline justify-between mb-3">
                    <div className="text-xs text-gray-500">Query Results</div>
                    <div className="text-xs text-gray-400">
                      {resultData.length} row
                      {resultData.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    <Table>
                      <TableHeader>
                        {columns.map((col) => (
                          <TableHeaderCell key={col}>{col}</TableHeaderCell>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {resultData.map((row: any, rowIdx: number) => (
                          <TableRow key={rowIdx}>
                            {columns.map((col) => (
                              <TableCell
                                key={col}
                                className="font-mono text-xs"
                              >
                                {row[col] !== null && row[col] !== undefined ? (
                                  <span className="text-gray-900">
                                    {String(row[col])}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 italic">
                                    NULL
                                  </span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* GitHub PR Link */}
          {entry.github_pr_url && (
            <div className="pt-6">
              <a
                href={entry.github_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                View GitHub PR →
              </a>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
