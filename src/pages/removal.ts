import type { APIRoute } from 'astro';

export const prerender = false;

const destination = 'https://joindeleteme.com';

const temporaryRedirect: APIRoute = () => new Response(null, {
  status: 307,
  headers: {
    Location: destination,
    'Cache-Control': 'no-store',
  },
});

export const GET = temporaryRedirect;
export const HEAD = temporaryRedirect;
export const ALL: APIRoute = () => new Response('Method not allowed', {
  status: 405,
  headers: { Allow: 'GET, HEAD' },
});
