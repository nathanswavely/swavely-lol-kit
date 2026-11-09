# swavely-lol-kit

What the [swavely.lol Hub](https://github.com/nathanswavely/swavely-lol) and every Tool on it
share, installed rather than copied
([swavely-lol ADR-0004](https://github.com/nathanswavely/swavely-lol/blob/main/docs/adr/0004-the-hub-and-its-tools-share-one-kit.md)).

| Import | What |
|---|---|
| `@swavely-lol/kit/contract` | `HubApiContract`, `Person`, `Viewer`, `Notice`: what the Hub promises a Tool over its `HUB` service binding. Added to, never altered. |
| `@swavely-lol/kit/guard` | `toolGuard({ needsPerson })`, a Tool's whole middleware; `refuseCrossOrigin`, `setHeaders`, `readCookie` for the Hub's own. |
| `@swavely-lol/kit/env` | `getEnv<E>()` (with development latency), `u()` for paths under the app's base, `hubUrl()`. |
| `@swavely-lol/kit/removals` | `runRemovals(env, purgePerson)`: asks the Hub who was removed since last time and keeps the cursor (ADR-0003). |
| `@swavely-lol/kit/Shell.astro` | The shell of every page: settings cog, way home, theme, sign in and out. |
| `@swavely-lol/kit/styles/shell.css` | Liquid Textile (textile finish, lol skin) and the shell's styles. |
| `@swavely-lol/kit/migrations/hub_cursor.sql` | The cursor table, to copy into a Tool's migrations. |

It ships source (`.ts`, `.astro`, `.css`); each app's Astro build compiles it.

## Using it

```
npm install github:nathanswavely/swavely-lol-kit#v0.1.0
```

Working on the kit and an app together, install it from disk instead
(`npm install ../swavely-lol-kit`) and switch back to the tag before deploying.

Each app also depends on the three `@fontsource` packages and imports them after
`shell.css` (see the top of [styles/shell.css](styles/shell.css)).

## Liquid Textile

Vendored in [styles/liquid-textile](styles/liquid-textile/VENDORED.md) at the commit
recorded there. `scripts/sync-liquid-textile.sh` copies a newer one; upgrading it is a
change to every app's look, so tag it on its own.

## Releasing

Tag `vX.Y.Z`, then bump the tag in the Hub and each Tool. A Tool can stay on an older
tag; anything removed from the contract would break it, which is why nothing is.
