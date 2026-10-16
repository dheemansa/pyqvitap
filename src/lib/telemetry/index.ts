import posthog from "posthog-js";

/**
 * Strips query parameters, search terms, and potential sensitive values from URLs/endpoints.
 */
export function sanitizeEndpoint(urlOrPath: string): string {
  try {
    if (urlOrPath.startsWith("/")) {
      return urlOrPath.split("?")[0]?.split("#")[0] ?? urlOrPath;
    }
    const parsed = new URL(urlOrPath, "https://pyqvitap.site");
    return parsed.pathname;
  } catch {
    return urlOrPath.split("?")[0] ?? "unknown_endpoint";
  }
}

/**
 * Strips potential sensitive keywords or credentials from error messages.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== "string") return "Unknown error";
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED_DB_URI]")
    .replace(
      /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/gi,
      "[REDACTED_EMAIL]",
    )
    .replace(
      /(key|token|secret|password|authorization|auth)=([^&\s]+)/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 300);
}

/**
 * Safe, fail-open client event dispatcher for PostHog.
 * Under no circumstances will this throw an error into the application.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (typeof window === "undefined") return;

    posthog.capture(name, properties);
  } catch {
    // Fail-open: telemetry outages or adblockers must never impact the UI
  }
}

/**
 * Safe, fail-open client error dispatcher for PostHog.
 * Under no circumstances will this throw an error into the application.
 */
export function trackError(
  errorName: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (typeof window === "undefined") return;

    // Sanitize properties before sending
    const sanitizedProps: Record<string, unknown> = {};
    if (properties) {
      for (const [key, val] of Object.entries(properties)) {
        if (typeof val === "string") {
          sanitizedProps[key] = sanitizeErrorMessage(val);
        } else {
          sanitizedProps[key] = val;
        }
      }
    }

    posthog.capture(errorName, sanitizedProps);
  } catch {
    // Fail-open
  }
}

/**
 * Telemetry helper for API failures.
 * Captures pathname only (no user query parameters or sensitive bodies).
 */
export function trackApiFailure(
  rawUrlOrPath: string,
  method: string,
  statusCode: number,
  durationMs?: number,
  category?: string,
): void {
  try {
    const endpoint = sanitizeEndpoint(rawUrlOrPath);
    trackError("api_request_failed", {
      endpoint,
      method: method.toUpperCase(),
      status_code: statusCode,
      duration_ms:
        durationMs !== undefined ? Math.round(durationMs) : undefined,
      error_category:
        category ?? (statusCode >= 500 ? "server_error" : "client_error"),
    });
  } catch {
    // Fail-open
  }
}

let globalListenersInitialized = false;

/**
 * Attaches browser-level error listeners for uncaught exceptions and unhandled promise rejections.
 * Idempotent: only binds once per browser session.
 */
export function initGlobalErrorTelemetry(): void {
  if (typeof window === "undefined" || globalListenersInitialized) return;
  globalListenersInitialized = true;

  try {
    window.addEventListener("error", (event: ErrorEvent) => {
      try {
        trackError("frontend_uncaught_exception", {
          error_message: sanitizeErrorMessage(
            event.message || "Uncaught exception",
          ),
          filename: event.filename
            ? sanitizeEndpoint(event.filename)
            : undefined,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
            ? sanitizeErrorMessage(String(event.error.stack))
            : undefined,
        });
      } catch {
        // Fail-open
      }
    });

    window.addEventListener(
      "unhandledrejection",
      (event: PromiseRejectionEvent) => {
        try {
          const reason = event.reason;
          const msg =
            reason instanceof Error
              ? reason.message
              : typeof reason === "string"
                ? reason
                : "Unhandled promise rejection";
          const stack = reason instanceof Error ? reason.stack : undefined;

          trackError("frontend_unhandled_rejection", {
            error_message: sanitizeErrorMessage(msg),
            stack: stack ? sanitizeErrorMessage(stack) : undefined,
          });
        } catch {
          // Fail-open
        }
      },
    );
  } catch {
    // Fail-open
  }
}
