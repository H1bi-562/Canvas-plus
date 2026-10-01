# CanvasPlus

A pnpm/Turborepo workspace with a Next.js web app and a WXT browser extension.
The extension opens the web app in a new tab in Chrome or Firefox.

## Local setup

Use Node.js 24 and pnpm 10.32.1.
Copy `.env.example` to `.env` at the repository root and supply your fresh PostgreSQL database URL and Better Auth secret.
Generate secrets locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Use different values for `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`.

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.
Registration creates a Better Auth account and its configuration row.
The new Drizzle migration is for a fresh database; the previous password hashes and JWT sessions are not migrated.
No legacy ORM was present: the old app used `pg` directly.
Drizzle now owns the schema, migrations, Better Auth adapter, and Canvas/configuration queries.
The database package retains parameterized PostgreSQL queries for the existing analytics, sync, layout, and timer transactions.

## Workspace

| Directory | Purpose |
| --- | --- |
| `apps/web` | Next.js pages and authenticated API routes |
| `apps/extension` | WXT toolbar action that opens the web app |
| `packages/auth` | Better Auth server and browser entry points |
| `packages/database` | Drizzle schema, migrations, encrypted secrets, and domain queries |
| `packages/tailwindcss` | Shared Tailwind v4 CSS and PostCSS configuration |
| `packages/eslint` | Base, Next.js, and extension lint configurations |
| `packages/vitest` | Node and React/jsdom test configurations |

Pages live at `/assignments`, `/calendar`, `/focus`, `/analytics`, and `/settings`.
Route-only components and clients live in `_components` and `_api` folders.
Shared components and API types remain in `components` and `lib`.
There are no empty `_actions` folders because mutations use HTTP handlers.

### Shared configuration imports

```js
// apps/web/eslint.config.mjs
export { default } from "@canvasplus/eslint/next";
// apps/extension/eslint.config.mjs
export { default } from "@canvasplus/eslint/extension";
// postcss.config.mjs in either app
export { default } from "@canvasplus/tailwindcss/postcss";
```

```css
@import "@canvasplus/tailwindcss/base.css";
@source "../**/*.{js,ts,jsx,tsx}";
```

```ts
import { mergeConfig } from "vitest/config";
import config from "@canvasplus/vitest/react";
// Server packages and the extension use @canvasplus/vitest/node.
export default mergeConfig(config, { test: { include: ["test/**/*.test.tsx"] } });
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Integration tests require an explicit `TEST_DATABASE_URL`.
They create and remove a unique schema in that database, with no fallback to `DATABASE_URL`.
Use a disposable database with permission to create schemas.
The original domain regression assertions still run with Node's built-in test runner through Vitest.
CI provides a disposable PostgreSQL service and runs all checks.

ESLint checks double quotes, semicolons, two-space indentation, and no trailing commas without imposing line wrapping.
Prettier and an automatic formatting commit hook are intentionally omitted to honor the requested preservation of code layout.
Prettier cannot enforce two blank lines around every function or preserve arbitrary existing wrapping.
Run `pnpm --filter @canvasplus/web exec eslint . --fix` to apply the selected style rules to the web app.

## Extension

```sh
pnpm --filter @canvasplus/extension dev
pnpm --filter @canvasplus/extension build
pnpm --filter @canvasplus/extension zip
```

Set `WXT_WEB_APP_URL` in `apps/extension/.env` or the build environment to your deployed HTTPS URL.
The default is http://localhost:3000.
This is a public build-time setting; never place secrets in it.
Chrome output is `apps/extension/.output/chrome-mv3`; load it as an unpacked extension in Developer mode.
Firefox output is `apps/extension/.output/firefox-mv2`; load its manifest as a temporary add-on using `about:debugging`.
The launcher needs no host, storage, or tab-reading permissions.
Set the final Firefox add-on ID before publishing to a store.

## Canvas and existing UI limits

Set `CANVAS_BASE_URL` and `ENCRYPTION_KEY` for personal-token connections.
OAuth additionally requires `CANVAS_CLIENT_ID`, `CANVAS_CLIENT_SECRET`, and `CANVAS_REDIRECT_URI`.
Use `http://localhost:3000/api/canvas/callback` as the local redirect URI.
Stored tokens are encrypted and never returned to the browser.
Demo data controls exist only in development.

The existing Google connection, AI actions, notifications, and website-blocking controls remain presentation-only features.
The extension does not block websites.
Password reset needs a mail provider and reset-email integration; the UI now states that it is unconfigured instead of claiming an email was sent.

Before/after screenshots and visual verification notes are in `docs/refactor-baseline`.
