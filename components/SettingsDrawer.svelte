<script lang="ts" module>
  import type { TranslationKey } from "@/lib/i18n";
  import type { RelayablePlatform, Theme } from "@/lib/types";

  const THEME_LABELS: Record<Theme, TranslationKey> = {
    system: "themeSystem",
    dark: "themeDark",
    light: "themeLight",
  };

  /** What each platform's paid events are called in the Streamlabs card. */
  const RELAY_LABELS: Record<RelayablePlatform, TranslationKey> = {
    youtube: "slRelayYouTube",
    twitch: "slRelayTwitch",
  };
</script>

<script lang="ts">
  import HistoryPanel from "./HistoryPanel.svelte";
  import Panel from "./Panel.svelte";
  import SecretInput from "./SecretInput.svelte";
  import Segment from "./Segment.svelte";
  import { useStore } from "@/lib/store";
  import { store } from "@/lib/state.svelte";
  import { i18n } from "@/lib/i18n.svelte";
  import { LOCALE_LABELS } from "@/lib/i18n";
  import { beginTwitchLogin } from "@/lib/adapters/twitch";
  import {
    LOCALE_PREFERENCES,
    RELAYABLE_PLATFORMS,
    THEMES,
    paidRelayed,
    type ConnectionStatus,
    type Platform,
    type Profile,
  } from "@/lib/types";

  interface Props {
    open: boolean;
    onClose: () => void;
    statuses: Record<Platform, ConnectionStatus>;
  }

  let { open, onClose, statuses }: Props = $props();

  const {
    setLocale,
    setTheme,
    setPlatformDisplay,
    setBandBackground,
    setTwitchClientId,
    updateProfile,
    addProfile,
    renameProfile,
    deleteProfile,
    setActiveProfile,
  } = useStore.getState();

  const t = $derived(i18n.t);
  const app = $derived(store.state.app);
  const profiles = $derived(store.state.profiles);
  const profile = $derived(store.profile);

  let confirmingDelete = $state(false);

  const toggle = (platform: Platform) =>
    updateProfile({ enabled: { ...profile.enabled, [platform]: !profile.enabled[platform] } });

  /**
   * Binds a text field to one string in the active profile's settings for a
   * platform, trimmed: stray whitespace is never part of a channel or an ID.
   */
  function field<P extends "twitch" | "youtube" | "kick", K extends keyof Profile[P]>(
    platform: P,
    key: K,
  ) {
    return {
      get: () => (profile[platform][key] as string | undefined) ?? "",
      set: (value: string) =>
        updateProfile({ [platform]: { ...profile[platform], [key]: value.trim() } }),
    };
  }

  const twitchChannel = field("twitch", "channel");
  const youtubeVideo = field("youtube", "video");
  const kickChannel = field("kick", "channel");
  const kickChatroom = field("kick", "chatroomId");
  const kickChannelId = field("kick", "channelId");
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex justify-end">
    <button class="absolute inset-0 bg-black/60" aria-label={t("closeSettings")} onclick={onClose}
    ></button>
    <aside
      class="relative w-full max-w-md overflow-y-auto border-l p-5"
      style:background="var(--ink)"
      style:border-color="var(--line)"
      aria-label={t("settings")}
    >
      <div class="mb-5 flex items-center justify-between">
        <h2 class="wordmark">{t("settings")}</h2>
        <button class="btn" onclick={onClose}>{t("done")}</button>
      </div>

      <!-- Appearance -->
      <section class="panel-card">
        <div class="panel-head">
          <h3 class="panel-title">{t("appearance")}</h3>
        </div>
        <Segment
          label={t("language")}
          value={app.locale}
          options={LOCALE_PREFERENCES.map((l) => ({
            value: l,
            label: l === "system" ? t("localeSystem") : LOCALE_LABELS[l],
          }))}
          onChange={setLocale}
        />
        <Segment
          label={t("theme")}
          value={app.theme}
          options={THEMES.map((th) => ({ value: th, label: t(THEME_LABELS[th]) }))}
          onChange={setTheme}
        />
        <Segment
          label={t("sourceLabel")}
          value={app.platformDisplay}
          options={[
            { value: "name", label: t("sourceLabelName") },
            { value: "mark", label: t("sourceLabelMark") },
          ]}
          onChange={setPlatformDisplay}
        />
        <p class="hint">{t("sourceLabelNote")}</p>
        <Segment
          label={t("bandBackground")}
          value={app.bandBackground}
          options={[
            { value: false, label: t("bandBackgroundOff") },
            { value: true, label: t("bandBackgroundOn") },
          ]}
          onChange={setBandBackground}
        />
        <p class="hint">{t("bandBackgroundNote")}</p>
      </section>

      <!-- Profiles -->
      <section class="panel-card">
        <div class="panel-head">
          <h3 class="panel-title">{t("profiles")}</h3>
        </div>

        {#each profiles as p (p.id)}
          <div class="profile-row">
            <button
              class="profile-pick"
              aria-current={p.id === profile.id}
              aria-label={t("switchProfile", { name: p.name })}
              onclick={() => {
                setActiveProfile(p.id);
                confirmingDelete = false;
              }}
            >
              {p.name}
            </button>
          </div>
        {/each}

        <button
          class="btn mb-3"
          onclick={() => {
            addProfile(t("newProfileName"));
            confirmingDelete = false;
          }}
        >
          + {t("addProfile")}
        </button>

        <label class="field">
          <span class="field-label">{t("profileName")}</span>
          <input
            class="input"
            aria-label={t("profileName")}
            bind:value={() => profile.name, (name) => renameProfile(profile.id, name)}
          />
        </label>

        {#if profiles.length > 1}
          <button
            class="btn"
            style:color={confirmingDelete ? "var(--danger)" : undefined}
            onclick={() => {
              if (confirmingDelete) {
                deleteProfile(profile.id);
                confirmingDelete = false;
              } else {
                confirmingDelete = true;
              }
            }}
          >
            {confirmingDelete
              ? t("deleteProfileConfirm", { name: profile.name })
              : t("deleteProfile")}
          </button>
        {:else}
          <p class="hint">{t("lastProfile")}</p>
        {/if}
      </section>

      <HistoryPanel {t} profileName={profile.name} />

      <div class="settings-section">
        <h3 class="eyebrow">{t("sectionDonations")}</h3>
        <p class="hint">{t("sectionDonationsHint")}</p>
      </div>

      <!-- Streamlabs -->
      <Panel
        platform="streamlabs"
        enabled={profile.enabled.streamlabs}
        onToggle={() => toggle("streamlabs")}
        status={statuses.streamlabs}
        {t}
      >
        <SecretInput
          label={t("slSocketToken")}
          placeholder={t("slTokenPlaceholder")}
          value={profile.streamlabs.socketToken}
          {t}
          onChange={(socketToken) =>
            updateProfile({ streamlabs: { ...profile.streamlabs, socketToken } })}
        />
        <p class="hint">{t("slHint")}</p>
        <fieldset class="field">
          <legend class="field-label">{t("slRelayLabel")}</legend>
          {#each RELAYABLE_PLATFORMS as platform (platform)}
            <label class="check">
              <input
                type="checkbox"
                bind:checked={
                  () => profile.streamlabs.relay?.[platform] === true,
                  (checked) =>
                    updateProfile({
                      streamlabs: {
                        ...profile.streamlabs,
                        relay: { ...profile.streamlabs.relay, [platform]: checked },
                      },
                    })
                }
              />{t(RELAY_LABELS[platform])}
            </label>
          {/each}
        </fieldset>
        <p class="hint">{t("slRelayHint")}</p>
      </Panel>

      <!-- StreamElements -->
      <Panel
        platform="streamelements"
        enabled={profile.enabled.streamelements}
        onToggle={() => toggle("streamelements")}
        status={statuses.streamelements}
        {t}
      >
        <SecretInput
          label={t("seToken")}
          placeholder={t("seTokenPlaceholder")}
          value={profile.streamelements.token}
          {t}
          onChange={(token) =>
            updateProfile({ streamelements: { ...profile.streamelements, token } })}
        />
        <Segment
          label={t("seMethod")}
          value={profile.streamelements.method}
          options={[
            { value: "jwt", label: t("seMethodJwt") },
            { value: "apikey", label: t("seMethodApikey") },
          ]}
          onChange={(method) =>
            updateProfile({ streamelements: { ...profile.streamelements, method } })}
        />
        <p class="hint">{t("seHint")}</p>
      </Panel>

      <!-- Ceneka -->
      <Panel
        platform="ceneka"
        enabled={profile.enabled.ceneka}
        onToggle={() => toggle("ceneka")}
        status={statuses.ceneka}
        {t}
      >
        <p class="hint" style:margin-top="0">{t("cenekaHint")}</p>
      </Panel>

      <div class="settings-section">
        <h3 class="eyebrow">{t("sectionChat")}</h3>
        <p class="hint">{t("sectionChatHint")}</p>
      </div>

      <!-- Twitch -->
      <Panel
        platform="twitch"
        enabled={profile.enabled.twitch}
        onToggle={() => toggle("twitch")}
        status={statuses.twitch}
        {t}
      >
        <label class="field">
          <span class="field-label">{t("channelToRead")}</span>
          <input
            class="input"
            placeholder={t("channelPlaceholder")}
            bind:value={twitchChannel.get, twitchChannel.set}
          />
        </label>
        <label class="field">
          <span class="field-label">{t("clientId")}</span>
          <input
            class="input"
            placeholder={t("clientIdPlaceholder")}
            bind:value={() => app.twitchClientId, (id) => setTwitchClientId(id.trim())}
          />
        </label>
        <!-- Outside the <label>: a hint is not part of the field's name. -->
        <p class="hint mb-3">{t("twitchClientIdShared")}</p>
        {#if profile.twitch.accessToken}
          <div class="flex flex-wrap items-center gap-3">
            <span class="hint" style:margin-top="0">
              {t("signedInAs", { user: profile.twitch.userLogin ?? "" })}
            </span>
            <button
              class="btn"
              onclick={() =>
                updateProfile({
                  twitch: {
                    ...profile.twitch,
                    accessToken: undefined,
                    userId: undefined,
                    userLogin: undefined,
                  },
                })}
            >
              {t("signOut")}
            </button>
          </div>
        {:else}
          <button
            class="btn btn-primary"
            disabled={!app.twitchClientId}
            onclick={() => beginTwitchLogin(app.twitchClientId)}
          >
            {t("signInWithTwitch")}
          </button>
        {/if}
        <p class="hint">{t("twitchHint")}</p>
        {#if paidRelayed(profile, "twitch")}
          <p class="hint">{t("twPaidElsewhere")}</p>
        {/if}
      </Panel>

      <!-- YouTube -->
      <Panel
        platform="youtube"
        enabled={profile.enabled.youtube}
        onToggle={() => toggle("youtube")}
        status={statuses.youtube}
        {t}
      >
        <label class="field">
          <span class="field-label">{t("videoIdOrUrl")}</span>
          <input
            class="input"
            placeholder={t("videoPlaceholder")}
            bind:value={youtubeVideo.get, youtubeVideo.set}
          />
        </label>
        <SecretInput
          label={t("apiKey")}
          placeholder={t("apiKeyPlaceholder")}
          value={profile.youtube.apiKey}
          {t}
          onChange={(apiKey) => updateProfile({ youtube: { ...profile.youtube, apiKey } })}
        />
        <p class="hint">{t("youtubeHint")}</p>
        {#if paidRelayed(profile, "youtube")}
          <p class="hint">{t("ytPaidElsewhere")}</p>
        {/if}
      </Panel>

      <!-- Kick -->
      <Panel
        platform="kick"
        enabled={profile.enabled.kick}
        onToggle={() => toggle("kick")}
        status={statuses.kick}
        {t}
      >
        <label class="field">
          <span class="field-label">{t("channelSlug")}</span>
          <input
            class="input"
            placeholder={t("channelPlaceholder")}
            bind:value={kickChannel.get, kickChannel.set}
          />
        </label>
        <label class="field">
          <span class="field-label">{t("chatroomId")}</span>
          <input
            class="input"
            inputmode="numeric"
            placeholder="123456"
            bind:value={kickChatroom.get, kickChatroom.set}
          />
        </label>
        <label class="field">
          <span class="field-label">{t("kickChannelId")}</span>
          <input
            class="input"
            inputmode="numeric"
            placeholder="123456"
            bind:value={kickChannelId.get, kickChannelId.set}
          />
        </label>
        <p class="hint">{t("kickChannelIdHint")}</p>
        <p class="hint">{t("kickHint")}</p>
        <!-- The lookup only works as a real navigation, so this is a link the
             user clicks rather than something the app can fetch. -->
        <p class="hint">
          {#if profile.kick.channel}
            <a
              href="https://kick.com/api/v2/channels/{encodeURIComponent(profile.kick.channel)}"
              target="_blank"
              rel="noreferrer"
            >
              {t("kickOpenLookup", { slug: profile.kick.channel })}
            </a>
          {:else}
            {t("kickNeedSlugFirst")}
          {/if}
        </p>
      </Panel>
    </aside>
  </div>
{/if}
