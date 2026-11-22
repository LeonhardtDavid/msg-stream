<!-- One platform's card in Settings: its name, its on/off switch, its fields. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { statusDetail } from "./StatusBar.svelte";
  import type { Translator } from "@/lib/i18n";
  import { PLATFORM_LABELS, type ConnectionStatus, type Platform } from "@/lib/types";

  interface Props {
    platform: Platform;
    enabled: boolean;
    onToggle: () => void;
    status: ConnectionStatus;
    t: Translator;
    children: Snippet;
  }

  let { platform, enabled, onToggle, status, t, children }: Props = $props();

  const detail = $derived(statusDetail(status, t));
</script>

<section class="panel-card" data-platform={platform} style:--ch="var(--{platform})">
  <div class="panel-head">
    <h3 class="panel-title">{PLATFORM_LABELS[platform]}</h3>
    <button
      class="switch"
      aria-pressed={enabled}
      aria-label={t("toggleChannel", {
        platform: PLATFORM_LABELS[platform],
        state: "",
        action: enabled ? t("off") : t("on"),
      })}
      onclick={onToggle}
    ></button>
  </div>
  {@render children()}
  {#if enabled && status.state === "error" && detail}
    <p class="hint" style:color="var(--danger)">{detail}</p>
  {/if}
</section>
