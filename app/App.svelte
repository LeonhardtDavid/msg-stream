<!-- The only page — everything runs client-side. -->
<script lang="ts">
  import Feed from "@/components/Feed.svelte";
  import StatusBar from "@/components/StatusBar.svelte";
  import SettingsDrawer from "@/components/SettingsDrawer.svelte";
  import { countUnread, selectVisibleEvents, useStore } from "@/lib/store";
  import { store } from "@/lib/state.svelte";
  import { i18n } from "@/lib/i18n.svelte";
  import { useConnections } from "@/lib/useConnections.svelte";
  import { useTheme } from "@/lib/useTheme.svelte";
  import type { Platform } from "@/lib/types";

  let settingsOpen = $state(false);

  const { loadOlder, markRead, markAllRead, setFilters, updateProfile } = useStore.getState();

  const hydrated = $derived(store.state.hydrated);
  const events = $derived(store.state.events);
  const readIds = $derived(store.state.readIds);
  const statuses = $derived(store.state.statuses);
  const filters = $derived(store.state.filters);
  const capture = $derived(store.state.app.capture);
  const platformDisplay = $derived(store.state.app.platformDisplay);
  const bandBackground = $derived(store.state.app.bandBackground);
  const profile = $derived(store.profile);
  const hasMore = $derived(store.state.hasMore);
  const loadingHistory = $derived(store.state.loadingHistory);

  useConnections();
  useTheme();
  const locale = $derived(i18n.locale);
  const t = $derived(i18n.t);

  // Taking in paid only means paid only — including chat already in history
  // from before the setting changed. Otherwise old chat reappears on reload
  // and contradicts the setting.
  const paidOnlyCapture = $derived(capture === "paid");
  const effectiveFilters = $derived(paidOnlyCapture ? { ...filters, tipsOnly: true } : filters);

  const visible = $derived(selectVisibleEvents(events, effectiveFilters, readIds));

  const unreadCount = $derived(countUnread(events, readIds));
  const unreadTips = $derived(countUnread(events, readIds, true));

  // With paid-only capture every message is paid, so a count of them would just
  // repeat the unread number. Naming the mode instead explains why no chat is
  // arriving.
  const counterNote = $derived(
    paidOnlyCapture ? t("capturePaid") : unreadTips > 0 ? `${unreadTips} ${t("paid")}` : null,
  );

  const anySourceOn = $derived(Object.values(profile.enabled).some(Boolean));
  const filtering = $derived(
    filters.unreadOnly || filters.tipsOnly || Object.values(filters.platforms).some((v) => !v),
  );

  const toggleSource = (platform: Platform) =>
    updateProfile({ enabled: { ...profile.enabled, [platform]: !profile.enabled[platform] } });
</script>

<!-- Settings and read state come from localStorage, which is only read after
     mount; until then there is nothing true to show. -->
{#if !hydrated}
  <main class="flex flex-1 items-center justify-center">
    <span class="eyebrow">{t("loading")}</span>
  </main>
{:else}
  <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col">
    <header
      class="sticky top-0 z-20 border-b px-4 py-3 backdrop-blur"
      style:background="color-mix(in srgb, var(--ink) 88%, transparent)"
      style:border-color="var(--line)"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <h1 class="wordmark">msg<span>·</span>stream</h1>
          <a
            class="icon-link"
            href="https://github.com/LeonhardtDavid/msg-stream"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("sourceCode")}
            title={t("sourceCode")}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
        </div>
        <div class="flex items-center gap-3">
          <span class="eyebrow" data-testid="active-profile">{profile.name}</span>
          <button class="btn" onclick={() => (settingsOpen = true)}>{t("settings")}</button>
        </div>
      </div>

      <StatusBar {statuses} enabled={profile.enabled} {t} onToggle={toggleSource} />

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="counter">
          <b>{unreadCount}</b>
          {t("unread")}{counterNote ? " · " : ""}{#if counterNote}<span class="cash"
              >{counterNote}</span
            >{/if}
        </span>

        <div class="ml-auto flex flex-wrap gap-2">
          <button
            class="chip"
            aria-pressed={filters.unreadOnly}
            onclick={() => setFilters({ unreadOnly: !filters.unreadOnly })}
          >
            {t("unreadOnly")}
          </button>
          <!-- A dead control is worse than none: with paid-only capture there
               is nothing for this to filter out. -->
          {#if !paidOnlyCapture}
            <button
              class="chip"
              aria-pressed={filters.tipsOnly}
              onclick={() => setFilters({ tipsOnly: !filters.tipsOnly })}
            >
              {t("paidOnly")}
            </button>
          {/if}
          <button class="chip" onclick={markAllRead} disabled={unreadCount === 0}>
            {t("markAllRead")}
          </button>
        </div>
      </div>
    </header>

    <Feed
      events={visible}
      {readIds}
      {locale}
      {platformDisplay}
      {bandBackground}
      {t}
      onToggleRead={markRead}
      {anySourceOn}
      filtered={filtering}
      {hasMore}
      {loadingHistory}
      onLoadOlder={() => void loadOlder()}
    />

    <SettingsDrawer open={settingsOpen} onClose={() => (settingsOpen = false)} {statuses} />
  </main>
{/if}
