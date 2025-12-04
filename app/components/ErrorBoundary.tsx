import { useRouteError, isRouteErrorResponse, Link } from "react-router";
import { XCircle } from "phosphor-react";

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <XCircle size={48} weight="bold" className="text-error-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            {error.status} {error.statusText}
          </h1>
          <p className="text-neutral-600 mb-6">
            {error.data || "Something went wrong"}
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <XCircle size={48} weight="bold" className="text-error-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          Unexpected Error
        </h1>
        <p className="text-neutral-600 mb-6">
          {error instanceof Error ? error.message : "An unexpected error occurred"}
        </p>
        <Link
          to="/"
          className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}

