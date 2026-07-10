export async function serveBriefingObject(
  bucket: R2Bucket,
  key: string | undefined,
  request: Request,
): Promise<Response> {
  if (!key || !key.startsWith('briefings/')) {
    return new Response('Not found', { status: 404 });
  }

  const range = request.headers.get('Range');
  const object = await bucket.get(
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
    let offset = 'offset' in object.range ? (object.range.offset ?? 0) : 0;
    let length = 'length' in object.range
      ? (object.range.length ?? object.size - offset)
      : object.size;

    if ('suffix' in object.range) {
      length = Math.min(object.range.suffix, object.size);
      offset = object.size - length;
    }

    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}
