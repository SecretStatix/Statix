/**
 * FastAPI base URL for direct fetches. Strips trailing slashes so paths never become `//api/...`
 * (which returns 404 on Starlette/FastAPI).
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/+$/, '');
}
