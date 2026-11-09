import type { MiddlewareHandler } from 'astro';
import { SESSION_COOKIE, type HubApiContract, type Viewer } from './contract';
import { getEnv, hubUrl, u, type BaseEnv } from './env';
import { FORM_HEADER, LOCATION_HEADER } from './forms';

/**
 * The locks every page on swavely.lol shares, and the middleware a Tool runs
 * (swavely-lol ADR-0001, ADR-0004).
 */

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * Every POST must come from this origin (Sec-Fetch-Site, or Origin). The session cookie
 * is SameSite=Lax, which already keeps a cross-site form from carrying it; this is the
 * second lock. Returns the refusal, or null to go on.
 */
export function refuseCrossOrigin(request: Request, url: URL): Response | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  const site = request.headers.get('Sec-Fetch-Site');
  const origin = request.headers.get('Origin');
  const sameOrigin = site === 'same-origin' || (origin !== null && origin === url.origin);
  return sameOrigin ? null : new Response('Cross-origin request refused.', { status: 403 });
}

/**
 * The headers on every response: nothing cached between people, no referrer off-site,
 * no framing. `indexed` is for the Shelf and Open Tools alone (ADR-0002).
 */
export function setHeaders(res: Response, pathname: string, opts: { indexed?: boolean } = {}): Response {
  const asset = pathname.includes('/_astro/');
  if (!opts.indexed && !asset) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (!asset) res.headers.set('Cache-Control', 'private, no-store');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  return res;
}

/**
 * The server's half of the Shell's forms (`forms.ts`): to a post sent by `fetch`, a
 * redirect comes back as a 204 naming where it went in `X-Lol-Location`, cookies kept,
 * so the page can stay put when it went back to itself. Anything else is untouched.
 */
export function formRedirect(request: Request, res: Response): Response {
  const to = res.headers.get('Location');
  if (!request.headers.has(FORM_HEADER) || !to || res.status < 300 || res.status >= 400) return res;
  const headers = new Headers(res.headers);
  headers.delete('Location');
  headers.set(LOCATION_HEADER, to);
  return new Response(null, { status: 204, headers });
}

export interface ToolEnvBase extends BaseEnv {
  HUB: HubApiContract;
  HUB_ORIGIN?: string;
}

/**
 * A Tool's middleware. Who is this: the Hub says. The browser sends the Hub's host-only
 * session cookie here because the Tool is a path on the same host; the Tool hands its
 * value to `HUB.whoIs` and keeps nothing of it. `locals.viewer` is set whenever someone
 * is signed in. Where `needsPerson(pathname)` is true and nobody is, it is off to the
 * Hub's sign-in, which sends them back. `/healthz` and built assets are always open.
 * Redirects to the Shell's forms go through `formRedirect`.
 *
 * `pathname` is the full path, base included (`/move/l/abc`); compare with `u()`.
 */
export function toolGuard(opts: { needsPerson: (pathname: string) => boolean }): MiddlewareHandler {
  return async (ctx, next) => {
    const { pathname } = ctx.url;
    const env = getEnv<ToolEnvBase>();

    const refused = refuseCrossOrigin(ctx.request, ctx.url);
    if (refused) return refused;

    const always = pathname === u('/healthz') || pathname.startsWith(u('/_astro/'));
    if (!always) {
      const id = readCookie(ctx.request, SESSION_COOKIE);
      const viewer: Viewer | null = id ? await env.HUB.whoIs(id) : null;
      if (viewer) (ctx.locals as { viewer?: Viewer }).viewer = viewer;
      else if (opts.needsPerson(pathname)) {
        return formRedirect(ctx.request, ctx.redirect(hubUrl(env, `/login?next=${encodeURIComponent(pathname + ctx.url.search)}`), 302));
      }
    }

    const res = formRedirect(ctx.request, await next());
    return setHeaders(res, pathname);
  };
}
