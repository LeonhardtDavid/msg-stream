<script lang="ts" module>
  const RETENTION_CHOICES = [7, 30, 90, 0];

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
  }
</script>

<!--
  Everything about what's kept on disk: how long, how much room it takes, and
  how to throw it away.
-->
<script lang="ts">
  import Segment from "./Segment.svelte";
  import { useStore } from "@/lib/store";
  import { store } from "@/lib/state.svelte";
  import { getMessageStore, type StorageEstimate } from "@/lib/messages";
  import type { Translator } from "@/lib/i18n";

  let { t, profileName }: { t: Translator; profileName: string } = $props();

  const { setCapture, setHistoryDays, clearHistory } = useStore.getState();
  const capture = $derived(store.state.app.capture);
  const historyDays = $derived(store.state.app.historyDays);
  const activeProfileId = $derived(store.state.activeProfileId);

  let estimate = $state<StorageEstimate | null>(null);
  let stored = $state<number | null>(null);
  let confirming = $state(false);

  $effect(() => {
    const profileId = activeProfileId;
    let cancelled = false;
    void (async () => {
      const messages = getMessageStore();
      const [usage, count] = await Promise.all([
        messages.estimate(),
        messages.countFor(profileId),
      ]);
      if (!cancelled) {
        estimate = usage;
        stored = count;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const storage = $derived(
    estimate && estimate.quota > 0
      ? t("storageUsed", { used: formatBytes(estimate.usage), total: formatBytes(estimate.quota) })
      : t("storageUnknown"),
  );

  function onClear() {
    if (!confirming) {
      confirming = true;
      return;
    }
    void clearHistory().then(() => {
      confirming = false;
      stored = 0;
    });
  }
</script>

<section class="panel-card">
  <div class="panel-head">
    <h3 class="panel-title">{t("history")}</h3>
  </div>

  <Segment
    label={t("capture")}
    value={capture}
    options={[
      { value: "paid", label: t("capturePaid") },
      { value: "all", label: t("captureAll") },
    ]}
    onChange={setCapture}
  />
  <p class="hint">{capture === "paid" ? t("capturePaidNote") : t("captureAllNote")}</p>

  <!-- Retention only governs chat, so it has nothing to do while chat is being
       ignored outright. -->
  {#if capture === "all"}
    <Segment
      label={t("historyKept")}
      value={historyDays}
      options={RETENTION_CHOICES.map((days) => ({
        value: days,
        label: days === 0 ? t("historyForever") : t("historyDaysValue", { days }),
      }))}
      onChange={setHistoryDays}
    />
    <p class="hint">{t("historyPaidNote")}</p>
  {/if}

  <p class="hint">
    {stored !== null ? `${t("storedMessages", { count: stored })}. ` : ""}{storage}
  </p>
  <p class="hint">
    {estimate?.persisted ? t("storagePersisted") : t("storageBestEffort")}
  </p>

  <button
    class="btn mt-2"
    style:color={confirming ? "var(--danger)" : undefined}
    onclick={onClear}
  >
    {confirming ? t("clearHistoryConfirm", { name: profileName }) : t("clearHistory")}
  </button>
</section>
