/**
 * Forms that keep your place. Every `<form method="post">` on swavely.lol works without
 * JavaScript: success redirects (303, usually back with `?done=`), a mistake renders the
 * page again with an error callout. With JavaScript, the Shell runs this, and a post
 * goes by `fetch` instead of a page load:
 *
 * - A mistake leaves the page as it was, typing and all; the error shows above the form.
 * - Success back to the same page swaps in the new `<main>`, keeps the form where it was
 *   on screen, keeps open `<details>` open, and puts the cursor back in a form the server
 *   emptied, ready for the next one. Its `[data-notice]` moves to sit above the form.
 * - Success anywhere else (another page, the Hub's sign-in) is an ordinary navigation.
 *
 * The server's half is `formRedirect` in the guard: it turns a redirect into a 204 with
 * `X-Lol-Location`, since `fetch` cannot see where a redirect went, or follow one to
 * another origin, as the Hub is in development.
 *
 * A form opts out with `data-reload`. Inline scripts in the new `<main>` run again; a
 * module script listens for `lol:swap` on `document`. A form is the same form after the
 * swap if it has the same `data-form`, or else the same hidden fields.
 */

export const FORM_HEADER = 'X-Lol-Form';
export const LOCATION_HEADER = 'X-Lol-Location';

const TEXTISH = 'input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=number],input[type=url],input[type=search],input[type=date],input[type=time],textarea';

// Read attributes, not `form.action` or `form.method`: a field named `action` (as most of
// these forms have) shadows the property.
const attr = (form: HTMLFormElement, name: string) => form.getAttribute(name) ?? '';
const targetOf = (form: HTMLFormElement, submitter: HTMLElement | null) =>
  new URL(submitter?.getAttribute('formaction') || attr(form, 'action') || location.href, location.href);

function keyOf(form: HTMLFormElement): string {
  if (form.dataset.form) return form.dataset.form;
  const hidden = [...form.querySelectorAll<HTMLInputElement>('input[type=hidden]')].map((i) => `${i.name}=${i.value}`);
  return `${attr(form, 'action')}?${hidden.join('&')}`;
}

function find(root: ParentNode, key: string): HTMLFormElement | undefined {
  return [...root.querySelectorAll<HTMLFormElement>('form')].find((f) => keyOf(f) === key);
}

function notice(node: Element, tone: string, role: 'alert' | 'status'): HTMLElement {
  const el = document.importNode(node, true) as HTMLElement;
  el.dataset.notice = tone;
  el.dataset.moved = '';
  el.setAttribute('role', role);
  return el;
}

function fallbackError(status: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'lt-callout lt-tone-error';
  el.textContent = status ? `That didn't go through (${status}). Try again.` : "That didn't go through. Check the connection and try again.";
  return notice(el, 'error', 'alert');
}

/**
 * Put a notice just above the form, or above its button when the form's top is off the
 * screen (a long form), without moving what you were looking at; then make sure the
 * notice itself is in view.
 */
function place(el: HTMLElement, form: HTMLFormElement, button?: Element | null) {
  const spot = form.getBoundingClientRect().top >= 0 || !button ? form : (button.closest('.lt-actions') ?? button);
  const top = spot.getBoundingClientRect().top;
  el.style.marginBottom = 'var(--lt-stack, 1rem)';
  spot.before(el);
  window.scrollBy(0, spot.getBoundingClientRect().top - top);
  const shown = el.getBoundingClientRect().top;
  if (shown < 0) window.scrollBy(0, shown - 16);
}

const buttonOf = (form: HTMLFormElement) => form.querySelector('[type=submit], button:not([type])');

/** Run a swapped-in `<main>`'s inline scripts, which arrive inert. */
function rerunScripts(root: Element) {
  for (const old of root.querySelectorAll('script')) {
    const s = document.createElement('script');
    for (const a of old.attributes) s.setAttribute(a.name, a.value);
    s.textContent = old.textContent;
    old.replaceWith(s);
  }
}

async function swap(url: string, form: HTMLFormElement) {
  const key = keyOf(form);
  const top = form.getBoundingClientRect().top;
  const scrollY = window.scrollY;
  const main = document.querySelector('main');
  const open = new Map<string, boolean>();
  main?.querySelectorAll('details').forEach((d) => {
    const f = d.querySelector('form');
    if (f) open.set(keyOf(f), d.open);
  });

  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const next = doc.querySelector('main');
  if (!main || !next || !res.ok) return location.assign(url);

  document.title = doc.title;
  history.replaceState(history.state, '', res.url || url);
  main.replaceWith(document.adoptNode(next));
  rerunScripts(next);
  next.querySelectorAll('details').forEach((d) => {
    const f = d.querySelector('form');
    const was = f && open.get(keyOf(f));
    if (was !== undefined && was !== null) d.open = was;
  });

  const again = find(next, key);
  const done = next.querySelector<HTMLElement>('[data-notice]');
  if (again) {
    if (done && !again.contains(done)) {
      done.setAttribute('role', done.dataset.notice === 'error' ? 'alert' : 'status');
      place(done, again, buttonOf(again));
    }
    const d = again.closest('details');
    if (d) d.open = true;
    window.scrollBy(0, again.getBoundingClientRect().top - top);
    const field = [...again.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXTISH)].find((i) => !i.disabled && !i.readOnly);
    if (field && field.value === '') field.focus({ preventScroll: true });
    else (buttonOf(again) as HTMLElement | null)?.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
  }
  document.dispatchEvent(new CustomEvent('lol:swap', { detail: { url } }));
}

async function submit(form: HTMLFormElement, action: URL, data: FormData, button: Element | null) {
  document.querySelectorAll('[data-notice][data-moved]').forEach((n) => n.remove());
  const body = attr(form, 'enctype') === 'multipart/form-data' ? data : new URLSearchParams(data as unknown as Record<string, string>);

  let res: Response;
  try {
    res = await fetch(action, { method: 'POST', body, headers: { [FORM_HEADER]: '1', Accept: 'text/html' } });
  } catch {
    return place(fallbackError(0), form, button);
  }

  const to = res.headers.get(LOCATION_HEADER);
  if (to) {
    const url = new URL(to, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname) return swap(url.href, form);
    return location.assign(url.href);
  }

  // A redirect fetch followed itself: this server has no `formRedirect`. Go there plainly.
  if (res.redirected) return location.assign(res.url);

  // No redirect: the server rendered the page again, which here means a mistake. The page
  // stays as typed; only the error comes across.
  const type = res.headers.get('Content-Type') ?? '';
  const doc = type.includes('text/html') ? new DOMParser().parseFromString(await res.text(), 'text/html') : null;
  const main = doc?.querySelector('main') ?? doc?.body;
  const err = main?.querySelector('[data-notice="error"]') ?? main?.querySelector('.lt-callout.lt-tone-error');
  if (err) return place(notice(err, 'error', 'alert'), form, button);
  const here = document.querySelector('main');
  if (res.ok && here && main?.tagName === 'MAIN') {
    // A page that renders on POST without a mistake (none do yet): show what it rendered.
    here.replaceWith(document.adoptNode(main));
    rerunScripts(main);
    return;
  }
  place(fallbackError(res.status), form, button);
}

export function enhanceForms() {
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (e.defaultPrevented || !(form instanceof HTMLFormElement)) return;
    const submitter = (e as SubmitEvent).submitter;
    if (attr(form, 'method').toLowerCase() !== 'post' || 'reload' in form.dataset) return;
    const action = targetOf(form, submitter);
    if (action.origin !== location.origin) return;
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    form.setAttribute('aria-busy', 'true');
    const data = new FormData(form, submitter);
    submitter?.setAttribute('disabled', '');
    submit(form, action, data, submitter ?? buttonOf(form)).finally(() => {
      form.removeAttribute('aria-busy');
      submitter?.removeAttribute('disabled');
    });
  });
}
