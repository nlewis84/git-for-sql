import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Form,
  useLocation,
} from "react-router";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { json } from "~/lib/json.server";
import { useLoaderData } from "react-router";
import "./tailwind.css";
import { getUserFromSession } from "~/lib/auth.server";
import { Lock } from "phosphor-react";
import { ErrorBoundary } from "~/components/ErrorBoundary";

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

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserFromSession(request);
  return json({
    user: user || null,
  });
}

export const meta: MetaFunction = () => {
  return [
    { title: "Git for SQL - SQL Script Management" },
    {
      name: "description",
      content: "Manage and execute SQL scripts with GitHub integration",
    },
  ];
};

type LoaderData = {
  user: {
    username: string;
    email: string | null;
    avatar: string;
    name: string | null;
  } | null;
};

export default function App() {
  const { user } = useLoaderData<LoaderData>();
  const location = useLocation();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans text-neutral-900 leading-relaxed min-h-screen">
        <header className="bg-white shadow-sm py-4 mb-6">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900 m-0">
                  <Lock size={20} weight="bold" className="text-primary-600" />
                  Git for SQL
                </h1>
                <nav className="flex gap-2">
                  <a
                    href="/"
                    className={`no-underline text-sm transition-all px-3 py-1.5 rounded ${
                      location.pathname === "/"
                        ? "text-primary-600 font-semibold bg-primary-50"
                        : "text-primary-500 hover:text-primary-700 hover:bg-primary-50 font-normal"
                    }`}
                  >
                    Dashboard
                  </a>
                  <a
                    href="/executions"
                    className={`no-underline text-sm transition-all px-3 py-1.5 rounded ${
                      location.pathname === "/executions"
                        ? "text-primary-600 font-semibold bg-primary-50"
                        : "text-primary-500 hover:text-primary-700 hover:bg-primary-50 font-normal"
                    }`}
                  >
                    Execution History
                  </a>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                {user ? (
                  <>
                    <Form method="post" action="/auth/logout">
                      <button
                        type="submit"
                        className="text-sm text-primary-600 hover:text-primary-700 hover:underline font-medium transition-colors"
                      >
                        Sign out
                      </button>
                    </Form>
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-8 h-8 rounded-full"
                    />
                  </>
                ) : (
                  <a
                    href="/auth/github"
                    className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded transition-colors no-underline"
                  >
                    Sign in with GitHub
                  </a>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
