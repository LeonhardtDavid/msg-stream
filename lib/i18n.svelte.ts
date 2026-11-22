import { store } from "./state.svelte";
import { makeTranslator, resolveLocale } from "./i18n";

/**
 * The language actually in use, with "system" already resolved against the
 * browser, and a translator bound to it. Everything that renders text or
 * formats a number wants these rather than the raw preference.
 */
const locale = $derived(resolveLocale(store.state.app.locale));
const t = $derived(makeTranslator(locale));

export const i18n = {
  get locale() {
    return locale;
  },
  get t() {
    return t;
  },
};
