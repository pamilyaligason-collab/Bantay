// JSON responses with CORS restricted to the ALLOWED_ORIGIN secret: one origin, or a comma list (the app origin plus, during an APK test
// window, a Pages preview origin; C1). The reply echoes the matching origin only. Unknown origins get no CORS headers.
export function corsHeaders(allowed: string | undefined, origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  const list = (allowed ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (origin && list.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    h['Access-Control-Max-Age'] = '600'
  }
  return h
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
