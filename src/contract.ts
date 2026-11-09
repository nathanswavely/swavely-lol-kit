/**
 * What the Hub promises a Tool (swavely-lol ADR-0001). A Tool binds the Hub's Worker as
 * `HUB` with `entrypoint: "HubApi"`; the class that keeps the promise is the Hub's
 * src/worker.ts. The Hub and every Tool import these types from the kit (ADR-0004), so
 * add to this file rather than altering it: a Tool on an older tag must keep working.
 */

/** A Person as a Tool sees one. `email` is null for a Managed Person. */
export interface Person {
  id: string;
  name: string;
  email: string | null;
  /** Who acts for this Person; empty unless they are Managed. */
  managerIds: string[];
}

/** The signed-in Person, with what they may do beyond being themselves. */
export interface Viewer extends Person {
  isHubAdmin: boolean;
  /** The Managed People this Viewer acts for. */
  manages: string[];
}

/** One email, sent by the Hub on a Tool's behalf. Plain lines; the Hub sets them. */
export interface Notice {
  subject: string;
  lines: string[];
  /** An absolute path on swavely.lol (`/gifts/...`); the Hub makes it a full URL. */
  cta?: { label: string; path: string };
}

export interface HubApiContract {
  /** Who holds this session cookie value, or null. */
  whoIs(sessionId: string): Promise<Viewer | null>;
  /** These People, in no particular order; unknown ids are left out. */
  people(ids: string[]): Promise<Person[]>;
  /**
   * Add a Person, or find the one who already has this email. A Person without an
   * email is always new. `addedBy` is the Person who added them, or whose link they
   * came through. `via` says where someone who **Joined** came from ("Mom's move on
   * MoveLink", ADR-0005); it is kept for a new Person only, and an existing Person is
   * returned unchanged.
   */
  addPerson(input: { name: string; email?: string | null; addedBy: string; via?: string }): Promise<{ person: Person; existed: boolean }>;
  /** Rename a Managed Person. People with an email name themselves (or a Hub Admin does). */
  renameManaged(personId: string, name: string): Promise<boolean>;
  /** Replace who manages a Managed Person. Managers must be People with an email. */
  setManagers(personId: string, managerIds: string[]): Promise<boolean>;
  /**
   * Email these People. A Managed Person's notice goes to each of their managers
   * instead, marked as being for them. Returns how many emails went and who could not
   * be reached.
   */
  notify(personIds: string[], notice: Notice): Promise<{ sent: number; unreachable: string[] }>;
  /**
   * The People removed from swavely.lol at or after `since` (unix seconds), oldest first,
   * at most 500 at a time (ADR-0003). A Tool removes everything it holds of each, then
   * asks again from the last `removedAt` it saw; the boundary repeats, so removing must
   * be safe to do twice. An id here never comes back. `runRemovals` (./removals) does the
   * asking.
   */
  removedSince(since: number): Promise<{ id: string; removedAt: number }[]>;
}

/** The Hub's session cookie: host-only on swavely.lol, so every Tool path receives it. */
export const SESSION_COOKIE = 'lol_session';
