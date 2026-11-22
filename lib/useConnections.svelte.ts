import { selectActiveProfile, useStore } from "./store";
import { store } from "./state.svelte";
import { startMessageHistory } from "./messages/startup";
import {
  GapTracker,
  HEARTBEAT_MS,
  clearHeartbeat,
  gapEvent,
  gapSinceHeartbeat,
  markAlive,
  readHeartbeat,
} from "./gaps";
import { PLATFORMS, type Platform, type SourceAdapter } from "./types";
import { consumeTwitchRedirect, validateTwitchToken } from "./adapters/twitch";
import { connectionConfig, connectionSignature, makeAdapter } from "./connections";

/**
 * Owns the lifecycle of every source adapter, reconciling live connections
 * against the active profile.
 *
 * Call it while a component is being set up: the connections live exactly as
 * long as that component does.
 */
export function useConnections() {
  const hydrated = $derived(store.state.hydrated);
  const historyReady = $derived(store.state.historyReady);
  const app = $derived(store.state.app);
  const profile = $derived(store.profile);
  const anyLive = $derived(
    Object.values(store.state.statuses).some((status) => status.state === "live"),
  );

  // Plain values, not state: they are bookkeeping that nothing renders.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above
  const active = new Map<Platform, { adapter: SourceAdapter<never>; sig: string }>();
  const gaps = new GapTracker();
  const { ingest, setStatus } = useStore.getState();

  // The store is created with `skipHydration`, so localStorage is read here, in
  // one known order: the heartbeat first (before anything can overwrite it),
  // then settings, then message history from IndexedDB once they're in place.
  // Nothing reactive is read, so this runs once, on mount.
  $effect(() => {
    void (async () => {
      // Read the heartbeat before anything can overwrite it: it says roughly
      // when this app last had sources listening.
      const lastAlive = readHeartbeat();
      clearHeartbeat();

      await useStore.persist.rehydrate();
      await startMessageHistory();

      const gap = gapSinceHeartbeat(lastAlive);
      if (gap) useStore.getState().ingest(gapEvent(gap));
    })();
  });

  // Finish the Twitch implicit-grant redirect: the token arrives in the URL
  // fragment, so this has to run on the client after navigation.
  $effect(() => {
    if (!hydrated) return;
    const token = consumeTwitchRedirect();
    if (!token) return;

    void validateTwitchToken(token).then((identity) => {
      if (!identity) {
        return setStatus("twitch", { state: "error", detailKey: "twitchSignInFailed" });
      }
      const state = useStore.getState();
      const current = selectActiveProfile(state);
      state.updateProfile({
        twitch: {
          ...current.twitch,
          accessToken: identity.accessToken,
          userId: identity.userId,
          userLogin: identity.userLogin,
        },
        enabled: { ...current.enabled, twitch: true },
      });
    });
  });

  $effect(() => {
    // Waiting for the store as well as the settings: connecting earlier would
    // drop the first messages of a session on the floor.
    if (!hydrated || !historyReady) return;

    for (const platform of PLATFORMS) {
      const wanted = profile.enabled[platform]
        ? connectionSignature(platform, profile, app)
        : null;
      const running = active.get(platform);

      if (running && running.sig === wanted) continue;

      if (running) {
        running.adapter.disconnect();
        active.delete(platform);
        // Switching a source off on purpose is not an outage.
        gaps.forget(platform);
        setStatus(platform, { state: "disconnected" });
      }

      if (wanted === null) continue;

      const adapter = makeAdapter(platform);
      active.set(platform, { adapter, sig: wanted });
      void adapter
        .connect(
          connectionConfig(platform, profile, app) as never,
          ingest,
          (status) => {
            // A source coming back after being down leaves a hole that only
            // YouTube can refill; the rest get a marker saying so.
            const gap = gaps.observe(platform, status.state === "live");
            if (gap) ingest(gapEvent(gap));
            setStatus(platform, status);
          },
          (cursor) => useStore.getState().setCursor(platform, cursor),
          useStore.getState().cursors[profile.id]?.[platform] ?? null,
        )
        .catch((err: unknown) =>
          setStatus(platform, {
            state: "error",
            detail: err instanceof Error ? err.message : String(err),
          }),
        );
    }
  });

  // While something is actually listening, leave a mark on a timer. If the tab
  // dies or is reloaded, that mark is how the next run knows when capture
  // stopped — and warn before an accidental reload throws it away.
  $effect(() => {
    if (!anyLive) return;

    markAlive();
    const timer = setInterval(markAlive, HEARTBEAT_MS);

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);

    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", warn);
    };
  });

  // Tear everything down on unmount so sockets don't outlive the page.
  $effect(() => () => {
    for (const { adapter } of active.values()) adapter.disconnect();
    active.clear();
  });
}
