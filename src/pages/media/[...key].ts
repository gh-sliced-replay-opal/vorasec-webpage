import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key || !key.startsWith('briefings/')) {
    return new Response('Not found', { status: 404 });
  }

  const range = request.headers.get('Range');
  const object = await env.BRIEFINGS_BUCKET.get(
    key,
    range ? { range: request.headers } : undefined,
  );

  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=3600');

  if (range && object.range) {
    const offset = 'offset' in object.range ? object.range.offset : 0;
    const length = 'length' in object.range ? object.range.length : object.size;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
};
