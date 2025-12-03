import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: #f9fafb;
            color: #111827;
            line-height: 1.6;
          }
          
          .container {
            max-width: 1280px;
            margin: 0 auto;
            padding: 0 1rem;
          }
          
          header {
            background: white;
            border-bottom: 1px solid #e5e7eb;
            padding: 1rem 0;
            margin-bottom: 2rem;
          }
          
          header h1 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #111827;
          }
          
          header p {
            color: #6b7280;
            font-size: 0.875rem;
          }
          
          .nav {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
          }
          
          .nav a {
            text-decoration: none;
            color: #6b7280;
            font-weight: 500;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            transition: all 0.2s;
          }
          
          .nav a:hover {
            background: #f3f4f6;
            color: #111827;
          }
          
          .nav a.active {
            background: #3b82f6;
            color: white;
          }
          
          .btn {
            display: inline-block;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-weight: 500;
            text-decoration: none;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.875rem;
          }
          
          .btn-primary {
            background: #3b82f6;
            color: white;
          }
          
          .btn-primary:hover {
            background: #2563eb;
          }
          
          .btn-danger {
            background: #ef4444;
            color: white;
          }
          
          .btn-danger:hover {
            background: #dc2626;
          }
          
          .btn-secondary {
            background: #6b7280;
            color: white;
          }
          
          .btn-secondary:hover {
            background: #4b5563;
          }
          
          .card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin-bottom: 1rem;
          }
          
          .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
          }
          
          .badge-success {
            background: #d1fae5;
            color: #065f46;
          }
          
          .badge-error {
            background: #fee2e2;
            color: #991b1b;
          }
          
          .badge-warning {
            background: #fef3c7;
            color: #92400e;
          }
          
          .badge-info {
            background: #dbeafe;
            color: #1e40af;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
          }
          
          th, td {
            text-align: left;
            padding: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
          }
          
          th {
            font-weight: 600;
            color: #374151;
            background: #f9fafb;
          }
          
          pre {
            background: #1f2937;
            color: #f9fafb;
            padding: 1rem;
            border-radius: 0.375rem;
            overflow-x: auto;
            font-size: 0.875rem;
            line-height: 1.5;
          }
          
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 50;
          }
          
          .modal {
            background: white;
            border-radius: 0.5rem;
            max-width: 42rem;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            padding: 1.5rem;
          }
          
          .alert {
            padding: 1rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
          }
          
          .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #10b981;
          }
          
          .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #ef4444;
          }
        `}</style>
      </head>
      <body>
        <header>
          <div className="container">
            <h1>🔐 Git for SQL</h1>
            <p>Peer-reviewed SQL execution with audit logging</p>
            <nav className="nav">
              <a href="/">Dashboard</a>
              <a href="/executions">Execution History</a>
            </nav>
          </div>
        </header>
        <main className="container">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

