# msg-stream

A browser-only console that merges live chat and paid messages from YouTube, Twitch, Kick, Streamlabs and StreamElements into one feed. The README's "How it's put together" section maps the code; read it before changing anything structural.

## Constraints

- **No server code.** It's a Svelte 5 single-page app on plain Vite (not SvelteKit), built to static files (`dist/`) and served by Cloudflare as assets only. There's no backend to add an API route or proxy to: everything, including the platform connections, runs in the browser. `index.html` is the page shell; `app/main.ts` mounts `app/App.svelte`.
- **Adapters own platform details.** Each platform is a `SourceAdapter` in `lib/adapters/` that emits a normalized `StreamEvent` (`lib/types.ts`). The UI never sees platform-specific shapes. Keep payload mapping in pure functions so it can be tested without a socket.
- **Never convert currencies.** An `Amount` keeps its native unit (bits, Kicks, ARS…) and is displayed as-is.
- **Storage:** messages go to IndexedDB (`lib/messages/`, Dexie) and only settings go to localStorage. Adapters wait for `historyReady` before connecting.
- **State:** `lib/store.ts` is a framework-free Zustand store (`useStore` keeps its old name; it is not a hook). Components read it through `store.state` from `lib/state.svelte.ts` and pick fields out with `$derived`; they call actions via `useStore.getState()`. Runes only appear in `.svelte` files and `.svelte.ts` modules.

## Conventions

- **Text:** every user-facing string goes through a translator (`i18n.t` from `lib/i18n.svelte.ts`, or the `t` prop passed down to a component) with a key in `lib/i18n.ts`. `en` is the source dictionary and `es` is typed against it, so add each key to both. `tests/i18n.test.ts` checks that keys and placeholders match.
- **Colours:** use the CSS variables in `app/globals.css` and don't hardcode hex values. Dark and light are separate palettes, so a new token needs a value in both. `--cash` (amber) is reserved for money amounts.
- **Icons:** `public/icon.svg` is the source. After editing it, run `node scripts/generate-icons.mjs` and commit the regenerated files, otherwise `tests/favicon.test.ts` fails.

## Checks

Node comes from `.nvmrc`. CI runs these steps in this order; run them before calling a change done:

```bash
npm run lint
npm run typecheck   # svelte-check: .ts and .svelte; vite build strips types without checking them
npm test
npm run build
```

Deploys come from Cloudflare's Git integration on push to `main`, not from CI, so a push to `main` ships whether or not the checks pass.
