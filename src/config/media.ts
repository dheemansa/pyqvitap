import { getCloudflareContext } from "@opennextjs/cloudflare";

export const DEFAULT_CLOUDINARY_FALLBACK_ENABLED = false;

interface FlagshipBinding {
  getBooleanValue(name: string, defaultValue?: boolean, context?: Record<string, unknown>): Promise<boolean>;
  getValue?(name: string, defaultValue?: unknown, context?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Evaluates the Cloudflare Flagship boolean flag `CLOUDINARY_FALLBACK_ENABLED`.
 *
 * Evaluation Order:
 * 1. Cloudflare Workers Flagship binding (`env.FLAGS`) if present in runtime context.
 * 2. Local environment variable `CLOUDINARY_FALLBACK_ENABLED` (e.g. for development or testing).
 * 3. Fail-safe default: `false`.
 *
 * Safety guarantees:
 * - Missing flag -> false
 * - Invalid flag value (non-boolean, non-"true" string) -> false
 * - Context throw / lookup exception -> false
 */
export async function isCloudinaryFallbackEnabled(): Promise<boolean> {
  // 1. Try Cloudflare Workers Flagship Binding
  try {
    const ctx = getCloudflareContext();
    const env = ctx?.env as { FLAGS?: FlagshipBinding } | undefined;
    const flags = env?.FLAGS;
    if (flags && typeof flags.getBooleanValue === "function") {
      const val = await flags.getBooleanValue("CLOUDINARY_FALLBACK_ENABLED", false);
      if (typeof val === "boolean") {
        return val;
      }
      return false;
    }
  } catch {
    // Flagship context not bound, or threw during evaluation
  }

  // 2. Fallback to process.env (local development / testing / node runtime)
  try {
    if (typeof process !== "undefined" && process.env) {
      const envVal = process.env.CLOUDINARY_FALLBACK_ENABLED;
      if (typeof envVal === "string" && envVal.trim().toLowerCase() === "true") {
        return true;
      }
    }
  } catch {
    // Environment access error
  }

  // 3. Strict fail-safe default: fallback is disabled
  return DEFAULT_CLOUDINARY_FALLBACK_ENABLED;
}
