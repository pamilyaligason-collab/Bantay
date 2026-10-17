// JSON responses with CORS restricted to the ALLOWED_ORIGIN secret (the app origin). Unknown origins get no CORS headers.
export function corsHeaders(allowed: string | undefined, origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  if (allowed && origin === allowed) {
    h['Access-Control-Allow-Origin'] = allowed
    h['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Max-Age'] = '600'
  }
  return h
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
