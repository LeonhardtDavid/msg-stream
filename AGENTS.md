<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# msg-stream

A browser-only console that merges live chat and paid messages from YouTube, Twitch, Kick, Streamlabs and StreamElements into one feed. The README's "How it's put together" section maps the code; read it before changing anything structural.

## Constraints

- **No server code.** `next.config.ts` sets `output: "export"`: no API routes, server actions, proxy/middleware, ISR or image optimization. Everything, including the platform connections, runs in the browser.
- **Adapters own platform details.** Each platform is a `SourceAdapter` in `lib/adapters/` that emits a normalized `StreamEvent` (`lib/types.ts`). The UI never sees platform-specific shapes. Keep payload mapping in pure functions so it can be tested without a socket.
- **Never convert currencies.** An `Amount` keeps its native unit (bits, Kicks, ARS…) and is displayed as-is.
- **Storage:** messages go to IndexedDB (`lib/messages/`, Dexie) and only settings go to localStorage. Adapters wait for `historyReady` before connecting.

## Conventions

- **Text:** every user-facing string goes through `useT()` with a key in `lib/i18n.ts`. `en` is the source dictionary and `es` is typed against it, so add each key to both. `tests/i18n.test.ts` checks that keys and placeholders match.
- **Colours:** use the CSS variables in `app/globals.css` and don't hardcode hex values. Dark and light are separate palettes, so a new token needs a value in both. `--cash` (amber) is reserved for money amounts.
- **Icons:** `app/icon.svg` is the source. After editing it, run `node scripts/generate-icons.mjs` and commit the regenerated files, otherwise `tests/favicon.test.ts` fails.

## Checks

Node comes from `.nvmrc`. CI runs these steps in this order; run them before calling a change done:

```bash
npm run lint
npx next typegen   # tsc needs the generated route types; a fresh clone fails without it
npx tsc --noEmit
npm test
npm run build
```

Deploys come from Cloudflare's Git integration on push to `main`, not from CI, so a push to `main` ships whether or not the checks pass.
