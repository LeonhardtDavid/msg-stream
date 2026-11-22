<script lang="ts" module>
  /**
   * How long a revealed value stays visible.
   *
   * Long enough to read a token off the screen and compare it, short enough that
   * one cannot be left exposed by walking away — which matters here, because the
   * person using this is often live on camera.
   */
  export const REVEAL_MS = 10_000;
</script>

<!--
  A credential field: masked by default, revealable on purpose, and never left
  revealed. It hides again on a timer, and because the settings drawer unmounts
  when it closes, it also starts masked every time it is reopened.

  Masking is shoulder-surfing protection, not security — the value is still in
  localStorage. That is exactly the threat worth covering for a streamer whose
  screen may be on air.
-->
<script lang="ts">
  import type { Translator } from "@/lib/i18n";

  interface Props {
    label: string;
    value: string;
    placeholder?: string;
    t: Translator;
    onChange: (value: string) => void;
  }

  let { label, value, placeholder, t, onChange }: Props = $props();

  let revealed = $state(false);

  $effect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => (revealed = false), REVEAL_MS);
    return () => clearTimeout(timer);
  });

  const toggleLabel = $derived(revealed ? t("hideValue") : t("showValue"));
</script>

<div class="field">
  <label class="secret">
    <span class="field-label">{label}</span>
    <!-- A function binding rather than value= plus oninput: after each edit it
         puts back whatever the owner kept, so a trimmed-away space never lingers
         in the field. -->
    <input
      class="input"
      type={revealed ? "text" : "password"}
      {placeholder}
      bind:value={() => value, (next) => onChange(next.trim())}
      autocomplete="off"
      spellcheck={false}
    />
  </label>
  <button
    type="button"
    class="secret-toggle"
    aria-pressed={revealed}
    aria-label={toggleLabel}
    title={toggleLabel}
    onclick={() => (revealed = !revealed)}
  >
    {toggleLabel}
  </button>
</div>
