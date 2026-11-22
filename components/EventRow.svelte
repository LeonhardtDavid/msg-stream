<script lang="ts" module>
  import type { Locale } from "@/lib/types";

  /** Locale-aware clock, memoized per locale rather than rebuilt on every row. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache; nothing renders it
  const timeFormatters = new Map<string, Intl.DateTimeFormat>();
  function timeFormatter(locale: Locale) {
    let formatter = timeFormatters.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      timeFormatters.set(locale, formatter);
    }
    return formatter;
  }
</script>

<script lang="ts">
  import MessageText from "./MessageText.svelte";
  import PlatformTag from "./PlatformTag.svelte";
  import { formatGapDuration, gapOf } from "@/lib/gaps";
  import { formatAmount } from "@/lib/money";
  import { contrastInk, tierColor } from "@/lib/tiers";
  import { PLATFORM_LABELS, type PlatformDisplay, type StreamEvent } from "@/lib/types";
  import type { Translator } from "@/lib/i18n";

  interface Props {
    event: StreamEvent;
    read: boolean;
    locale: Locale;
    platformDisplay: PlatformDisplay;
    bandBackground: boolean;
    t: Translator;
    onToggleRead: (id: string, read: boolean) => void;
  }

  let { event, read, locale, platformDisplay, bandBackground, t, onToggleRead }: Props =
    $props();

  const gap = $derived(gapOf(event));
  const clock = $derived(timeFormatter(locale));
  const tip = $derived(event.amount !== undefined);
  // Text the app wrote itself follows the chosen language; what a viewer typed
  // is shown exactly as sent.
  const message = $derived(
    event.messageKey ? t(event.messageKey, event.messageVars) : event.message,
  );
  // The platform's own colour for this band, where it publishes one. Sources
  // that don't — and amounts with no band — stay plain rather than being tinted
  // a colour nobody chose, or shown as the smallest possible donation.
  const bandColor = $derived(tierColor(event.platform, event.amount));
  const readLabel = $derived(read ? t("markUnread") : t("markRead"));
</script>

{#if gap}
  <div class="row" data-kind="system">
    <div>
      <span class="gap-title">
        {t("gapTitle", { duration: formatGapDuration(gap.to - gap.from) })}
      </span>
      <div class="gap-body">
        {t(gap.platform ? "gapBodyPlatform" : "gapBody", {
          platform: gap.platform ? PLATFORM_LABELS[gap.platform] : "",
          from: clock.format(gap.from),
          to: clock.format(gap.to),
        })}
      </div>
    </div>
  </div>
{:else}
  <!-- Ink is derived per colour: no single one reads on both the pale yellow
       band and the deep red one. -->
  <div
    class="row"
    data-read={read}
    data-tip={tip}
    data-banded={bandColor ? "true" : undefined}
    data-band-bg={bandColor && bandBackground ? "true" : undefined}
    data-platform={event.platform}
    style:--ch="var(--{event.platform})"
    style:--band={bandColor || undefined}
    style:--band-ink={bandColor ? contrastInk(bandColor) : undefined}
  >
    <div class="row-rail"></div>

    <div class="min-w-0">
      <div class="row-head">
        <PlatformTag platform={event.platform} display={platformDisplay} />
        <span class="row-author">{event.author.name}</span>
        <!-- Only when there's no amount — otherwise "1 sub" already says it. -->
        {#if event.kind === "subscription" && !event.amount}
          <span class="kind-tag">{t("subTag")}</span>
        {/if}
        <!-- Beside the name rather than on its own line: with paid-only capture
             every row carries an amount, so a dedicated line for it costs a
             line on every message in the feed. -->
        {#if event.amount}
          <span class="amount">{formatAmount(event.amount, locale)}</span>
        {/if}
        <span class="row-time">{clock.format(event.timestamp)}</span>
      </div>

      {#if message}
        <div class="row-message"><MessageText text={message} /></div>
      {/if}
    </div>

    <button
      class="readbtn"
      aria-pressed={read}
      aria-label={readLabel}
      title={readLabel}
      onclick={() => onToggleRead(event.id, !read)}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
{/if}
