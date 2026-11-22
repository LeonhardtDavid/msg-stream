import { store } from "./state.svelte";
import { applyTheme, resolveTheme, systemPrefersDark } from "./theme";

/**
 * Keeps the painted theme in step with the stored preference. The boot script in
 * lib/theme.ts handles the very first paint; this takes over afterwards, and
 * follows the OS live while the preference is "system".
 *
 * Call it while a component is being set up: the effect lives as long as that
 * component does.
 */
export function useTheme() {
  const theme = $derived(store.state.app.theme);
  const hydrated = $derived(store.state.hydrated);

  $effect(() => {
    if (!hydrated) return;
    applyTheme(resolveTheme(theme, systemPrefersDark()));

    // Only "system" needs to follow the OS, and only where the query exists —
    // guarded for the same reason systemPrefersDark is.
    if (theme !== "system" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  });
}
