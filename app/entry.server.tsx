import { PassThrough } from "node:stream";
import type { EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { renderToPipeableStream } from "react-dom/server";
import { initializeSchema, testConnections } from "./lib/db.server";
import { validateConfig } from "./config.server";

const ABORT_DELAY = 5_000;

// Initialize database on server start
validateConfig();
initializeSchema().then(() => testConnections());

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  // Handle .well-known requests (Chrome DevTools, etc.) - return 404 without logging
  const url = new URL(request.url);
  if (url.pathname.startsWith("/.well-known/")) {
    return new Response(null, { status: 404 });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
        abortDelay={ABORT_DELAY}
      />,
      {
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Suppress errors for .well-known requests (Chrome DevTools, etc.)
          const url = new URL(request.url);
          if (url.pathname.startsWith("/.well-known/")) {
            return; // Don't log these errors
          }
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
