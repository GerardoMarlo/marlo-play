// HTML and ASSETS are injected by build-personal.mjs.
const ORIGIN = 'https://my.marlo.games';
export function handlePersonal(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'my.marlo.games' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    return new Response('Not found', { status: 404 });
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (url.hostname === 'my.marlo.games' && url.protocol !== 'https:') {
    return Response.redirect(ORIGIN + url.pathname + url.search, 301);
  }
  let body, type, status = 200;
  if (url.pathname === '/') {
    body = HTML;
    type = 'text/html; charset=utf-8';
  } else if (Object.hasOwn(ASSETS, url.pathname)) {
    body = Uint8Array.from(atob(ASSETS[url.pathname]), c => c.charCodeAt(0));
    type = url.pathname.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
  } else if (url.pathname === '/robots.txt') {
    body = `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`;
    type = 'text/plain; charset=utf-8';
  } else if (url.pathname === '/sitemap.xml') {
    body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url></urlset>`;
    type = 'application/xml; charset=utf-8';
  } else {
    body = '<!doctype html><html lang="en"><title>Not found · MARLO</title><h1>Nothing here yet.</h1><a href="/">Back to MARLO</a></html>';
    type = 'text/html; charset=utf-8';
    status = 404;
  }
  return new Response(request.method === 'HEAD' ? null : body, { status, headers: {
    'Content-Type': type, 'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'
  } });
}
export default { fetch: handlePersonal };
