import { createSubscriber } from "svelte/reactivity";
import { selectActiveProfile, useStore, type StoreState } from "./store";
import type { Profile } from "./types";

/**
 * Subscribes to the Zustand store only while something reactive is reading it,
 * and lets Svelte know whenever the store changes.
 */
const track = createSubscriber((update) => useStore.subscribe(update));

/**
 * The store's state, readable from Svelte. Reading `store.state` inside a
 * component, `$derived` or `$effect` makes it re-run when the store changes.
 *
 * Every change invalidates every reader, so select what you need with
 * `$derived(store.state.events)`: a derived only passes the change on when the
 * value it picked out is actually a different object — the same job a Zustand
 * selector did under React.
 */
export const store = {
  get state(): StoreState {
    track();
    return useStore.getState();
  },
  /** The profile whose channels are currently connected. */
  get profile(): Profile {
    return selectActiveProfile(this.state);
  },
};
