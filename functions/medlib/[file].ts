/** Cloudflare Pages Function: same-origin download path for the optional mdwiki pack (D-158).
 *  GitHub release downloads send no CORS headers, so the app fetches bantay.pages.dev/medlib/<file> and this forwards the
 *  request (with Range / If-Range) to the GitHub release asset and streams the answer back. Only dated pack names pass. */
const RELEASE = 'https://github.com/pamilyaligason-collab/Bantay/releases/download/medlib-v1/'
export const PACK_NAME = /^medlib-mdwiki-\d{4}-\d{2}-\d{2}\.pack$/
const PASS_UP = ['range', 'if-range']
const PASS_DOWN = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']

export async function onRequestGet({ request, params }: { request: Request; params: { file?: string | string[] } }): Promise<Response> {
  const file = typeof params.file === 'string' ? params.file : ''
  if (!PACK_NAME.test(file)) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  for (const h of PASS_UP) { const v = request.headers.get(h); if (v) headers.set(h, v) }
  const up = await fetch(RELEASE + file, { headers, redirect: 'follow' })
  const out = new Headers({ 'content-type': 'application/octet-stream', 'cache-control': 'no-store' })
  for (const h of PASS_DOWN) { const v = up.headers.get(h); if (v) out.set(h, v) }
  return new Response(up.body, { status: up.status, headers: out })
}
