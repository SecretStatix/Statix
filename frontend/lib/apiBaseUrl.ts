/**
 * FastAPI base URL for direct `fetch` calls.
 * Normalizes so we never request `//api/...` (double slash → FastAPI 404).
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.trim().replace(/\/+$/, '');
}
