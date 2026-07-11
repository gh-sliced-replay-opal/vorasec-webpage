import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { serveBriefingObject } from '../../lib/r2';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ? `briefings/${params.key}` : undefined;
  return serveBriefingObject(env.BRIEFINGS_BUCKET, key, request);
};
