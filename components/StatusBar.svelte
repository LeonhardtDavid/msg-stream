<script lang="ts" module>
  import type { ConnectionStatus, ConnectionState } from "@/lib/types";
  import type { TranslationKey, Translator } from "@/lib/i18n";

  const STATE_LABELS: Record<ConnectionState, TranslationKey> = {
    disconnected: "stateDisconnected",
    connecting: "stateConnecting",
    live: "stateLive",
    error: "stateError",
    unavailable: "stateUnavailable",
  };

  /** Renders whatever an adapter said about itself, translated when it's a key. */
  export function statusDetail(status: ConnectionStatus, t: Translator): string | undefined {
    if (status.detailKey) return t(status.detailKey, status.detailVars);
    return status.detail;
  }
</script>

<!--
  The channel strip. One LED per platform, showing whether that source is
  actually delivering. Clicking a channel arms or disarms it.
-->
<script lang="ts">
  import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/types";

  interface Props {
    statuses: Record<Platform, ConnectionStatus>;
    enabled: Record<Platform, boolean>;
    t: Translator;
    onToggle: (platform: Platform) => void;
  }

  let { statuses, enabled, t, onToggle }: Props = $props();

  const channels = $derived(
    PLATFORMS.map((platform) => {
      const status = statuses[platform];
      const on = enabled[platform];
      const state: ConnectionState = on ? status.state : "disconnected";
      const stateLabel = on ? t(STATE_LABELS[state]) : t("stateOff");
      return {
        platform,
        state,
        title: (on ? statusDetail(status, t) : undefined) ?? stateLabel,
        label: t("toggleChannel", {
          platform: PLATFORM_LABELS[platform],
          state: stateLabel,
          action: on ? t("off") : t("on"),
        }),
      };
    }),
  );
</script>

<div class="led-strip">
  {#each channels as channel (channel.platform)}
    <button
      class="led"
      data-state={channel.state}
      data-platform={channel.platform}
      style:--ch="var(--{channel.platform})"
      onclick={() => onToggle(channel.platform)}
      title={channel.title}
      aria-label={channel.label}
    >
      <span class="led-dot"></span>{PLATFORM_LABELS[channel.platform]}
    </button>
  {/each}
</div>
