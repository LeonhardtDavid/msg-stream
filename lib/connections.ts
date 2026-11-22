import {
  type AppSettings,
  type Platform,
  type Profile,
  type SourceAdapter,
  paidRelayed,
} from "./types";
import { TwitchAdapter } from "./adapters/twitch";
import { KickAdapter } from "./adapters/kick";
import { YouTubeAdapter } from "./adapters/youtube";
import { CenekaAdapter } from "./adapters/ceneka";
import { StreamlabsAdapter } from "./adapters/streamlabs";
import { StreamElementsAdapter } from "./adapters/streamelements";

export function makeAdapter(platform: Platform): SourceAdapter<never> {
  switch (platform) {
    case "twitch":
      return new TwitchAdapter() as SourceAdapter<never>;
    case "youtube":
      return new YouTubeAdapter() as SourceAdapter<never>;
    case "kick":
      return new KickAdapter() as SourceAdapter<never>;
    case "streamlabs":
      return new StreamlabsAdapter() as SourceAdapter<never>;
    case "streamelements":
      return new StreamElementsAdapter() as SourceAdapter<never>;
    case "ceneka":
      return new CenekaAdapter() as SourceAdapter<never>;
  }
}

/**
 * A string that changes exactly when a platform needs reconnecting. Comparing
 * these instead of object identity keeps an unrelated settings edit (say, typing
 * in the YouTube field) from tearing down a healthy Twitch socket.
 *
 * The profile id is part of every signature: switching profiles points at
 * different channels, so everything must reconnect.
 */
export function connectionSignature(
  platform: Platform,
  profile: Profile,
  app: AppSettings,
): string {
  const scope = profile.id;
  switch (platform) {
    case "twitch": {
      const t = profile.twitch;
      return [
        scope,
        t.channel,
        app.twitchClientId,
        t.accessToken ?? "",
        t.userId ?? "",
        paidRelayed(profile, "twitch"),
      ].join("|");
    }
    case "youtube":
      return [
        scope,
        profile.youtube.video,
        profile.youtube.apiKey,
        paidRelayed(profile, "youtube"),
      ].join("|");
    case "kick":
      return [scope, profile.kick.chatroomId, profile.kick.channelId ?? ""].join("|");
    case "streamlabs":
      return [
        scope,
        profile.streamlabs.socketToken,
        profile.streamlabs.relay?.youtube === true,
        profile.streamlabs.relay?.twitch === true,
      ].join("|");
    case "streamelements":
      return [scope, profile.streamelements.token, profile.streamelements.method].join("|");
    case "ceneka":
      return [scope, profile.ceneka.token ?? ""].join("|");
  }
}

/** The config object each adapter's `connect` expects. */
export function connectionConfig(
  platform: Platform,
  profile: Profile,
  app: AppSettings,
): unknown {
  if (platform === "twitch") {
    // The client ID is app-level, so it's merged in here rather than duplicated
    // into every profile.
    return {
      ...profile.twitch,
      clientId: app.twitchClientId,
      paidElsewhere: paidRelayed(profile, "twitch"),
    };
  }
  if (platform === "youtube") {
    return { ...profile.youtube, paidElsewhere: paidRelayed(profile, "youtube") };
  }
  return profile[platform];
}
