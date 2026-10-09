/**
 * Media URL resolution utility for PyqVitAp.
 * Maps stored media references (Cloudinary URLs or relative storage keys)
 * to the internal media gateway endpoint: /api/media/<object-key>.
 *
 * Safe fallback:
 * If an input URL cannot be parsed or mapped to the 'papers/' namespace,
 * it returns the original URL with HTTPS normalization.
 */

export function getMediaGatewayUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/api/media/")) return url;

  try {
    const u = new URL(url);
    const uploadPattern = /\/(?:raw|image)\/upload\/(?:v\d+\/)?(papers\/.+)$/;
    const match = uploadPattern.exec(u.pathname);
    if (match?.[1]) {
      return `/api/media/${match[1]}`;
    }
  } catch {
    // Relative key support
    if (url.startsWith("papers/")) {
      return `/api/media/${url}`;
    }
  }

  // Fallback: return original URL with https enforcement
  return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}
