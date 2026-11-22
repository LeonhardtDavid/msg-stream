<script lang="ts">
  import EventRow from "./EventRow.svelte";
  import type { Translator } from "@/lib/i18n";
  import type { Locale, PlatformDisplay, StreamEvent } from "@/lib/types";

  interface Props {
    events: StreamEvent[];
    readIds: Record<string, true>;
    locale: Locale;
    platformDisplay: PlatformDisplay;
    bandBackground: boolean;
    t: Translator;
    onToggleRead: (id: string, read: boolean) => void;
    anySourceOn: boolean;
    filtered: boolean;
    hasMore: boolean;
    loadingHistory: boolean;
    onLoadOlder: () => void;
  }

  let {
    events,
    readIds,
    locale,
    platformDisplay,
    bandBackground,
    t,
    onToggleRead,
    anySourceOn,
    filtered,
    hasMore,
    loadingHistory,
    onLoadOlder,
  }: Props = $props();

  const empty = $derived(
    !anySourceOn
      ? (["emptyNoSourcesTitle", "emptyNoSourcesBody"] as const)
      : filtered
        ? (["emptyFilteredTitle", "emptyFilteredBody"] as const)
        : (["emptyWaitingTitle", "emptyWaitingBody"] as const),
  );
</script>

{#if events.length === 0}
  <div class="empty">
    <div class="empty-title">{t(empty[0])}</div>
    <p class="text-sm">{t(empty[1])}</p>
  </div>
{:else}
  <div>
    {#each events as event (event.id)}
      <EventRow
        {event}
        read={readIds[event.id] === true}
        {locale}
        {platformDisplay}
        {bandBackground}
        {t}
        {onToggleRead}
      />
    {/each}

    <!-- Older messages are on disk but not in the feed; this pulls the next
         page back rather than loading a whole stream's history up front. -->
    <div class="feed-foot">
      {#if hasMore}
        <button class="btn" onclick={onLoadOlder} disabled={loadingHistory}>
          {loadingHistory ? t("loadingOlder") : t("loadOlder")}
        </button>
      {:else}
        <span class="hint">{t("noOlder")}</span>
      {/if}
    </div>
  </div>
{/if}
