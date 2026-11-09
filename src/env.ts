import { env as workerEnv } from 'cloudflare:workers';
import { withLatency } from './dev-latency';

/**
 * The Worker env, for the Hub and every Tool: wrangler.jsonc vars, secrets, bindings,
 * and .dev.vars locally. `astro dev` runs on workerd too, so the same import serves
 * both. In development DEV_DB_LATENCY_MS slows the database to production's round trip
 * (dev-latency.ts), so local timings mean something.
 */
export interface BaseEnv {
  DB: D1Database;
  /** Development only: milliseconds to add to every database call. */
  DEV_DB_LATENCY_MS?: string;
}

let cached: unknown;
export function getEnv<E extends BaseEnv>(): E {
  if (cached) return cached as E;
  const env = workerEnv as unknown as E;
  const ms = import.meta.env.DEV ? Number(env.DEV_DB_LATENCY_MS ?? 0) : 0;
  cached = ms ? { ...env, DB: withLatency(env.DB, ms) } : env;
  return cached as E;
}

/** A path inside this app, with its base (`/gifts`, `/move`, or none for the Hub). */
export function u(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * A path on the Hub: same origin in production, the Hub's port in development. A Tool
 * sets HUB_ORIGIN in .dev.vars; the Hub itself has none, so its paths stay as they are.
 */
export function hubUrl(env: { HUB_ORIGIN?: string }, path: string): string {
  return (env.HUB_ORIGIN ?? '') + path;
}
