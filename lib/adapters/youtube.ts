import { writtenText } from "../i18n";
import { fromMicros } from "../money";
import type {
  ConnectionStatus,
  Cursor,
  CursorSink,
  EventSink,
  Platform,
  SourceAdapter,
  StatusSink,
  StreamEvent,
  YouTubeConnectConfig,
} from "../types";

const API = "https://www.googleapis.com/youtube/v3";

/**
 * Note the path: the resource is `liveChatMessages` but the endpoint is
 * `liveChat/messages`. Getting this wrong returns a 404 with an HTML body,
 * which then fails to parse as JSON and looks like a network outage rather
 * than a bad URL.
 */
const LIVE_CHAT_MESSAGES = `${API}/liveChat/messages`;

/**
 * Never poll faster than this regardless of what the API suggests. The daily
 * quota is 10,000 units per key and each poll costs several, so an aggressive
 * interval burns a streamer's whole day in a couple of hours.
 */
const MIN_POLL_MS = 4000;

/**
 * What a donation service relays for YouTube, per Streamlabs' documented
 * events. Super Stickers and gifted memberships aren't among them, so those
 * still come from here even when paid events are relayed.
 */
const RELAYED_TYPES = new Set(["superChatEvent", "newSponsorEvent"]);

/**
 * Pace once YouTube reports the stream offline. Not a stop: an encoder that
 * drops for a minute brings the same broadcast back, and its chat with it. The
 * chat actually closing is what stops polling, and YouTube says so explicitly.
 */
const OFFLINE_POLL_MS = 30_000;

/** Accepts a bare video id, a watch URL, a youtu.be link, or a /live/ URL. */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const v = url.searchParams.get("v");
    if (v) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[\w-]{11}$/.test(last)) return last;
  } catch {
    // Not a URL; fall through.
  }
  return null;
}

interface VideosResponse {
  items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>;
}

interface ChatResponse {
  items?: LiveChatMessage[];
  nextPageToken?: string;
  pollingIntervalMillis?: number | string;
  /** Present only once the stream has gone offline. */
  offlineAt?: string;
}

interface LiveChatMessage {
  id: string;
  snippet: {
    type: string;
    publishedAt: string;
    displayMessage?: string;
    textMessageDetails?: { messageText: string };
    superChatDetails?: {
      amountMicros: string;
      currency: string;
      amountDisplayString: string;
      userComment?: string;
      /** YouTube's colour band. It publishes no maximum, so none is claimed. */
      tier?: number;
    };
    superStickerDetails?: {
      amountMicros: string;
      currency: string;
      amountDisplayString: string;
      superStickerMetadata?: { altText?: string };
      tier?: number;
    };
    membershipGiftingDetails?: { giftMembershipsCount?: number; giftMembershipsLevelName?: string };
    newSponsorDetails?: { memberLevelName?: string };
  };
  authorDetails: {
    displayName: string;
    profileImageUrl: string;
  };
}

/** What YouTube needs to carry on from where it stopped. */
export interface YouTubeCursor extends Cursor {
  videoId: string;
  liveChatId: string;
  pageToken?: string;
}

/** A stored cursor is only usable if it belongs to the video being watched. */
export function usableCursor(
  resume: Cursor | null | undefined,
  videoId: string,
): YouTubeCursor | null {
  const cursor = resume as YouTubeCursor | null | undefined;
  if (!cursor?.liveChatId || cursor.videoId !== videoId) return null;
  return cursor;
}

export class YouTubeAdapter implements SourceAdapter<YouTubeConnectConfig> {
  platform: Platform = "youtube";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private pageToken: string | undefined;
  private onCursor: CursorSink = () => {};

  async connect(
    settings: YouTubeConnectConfig,
    onEvent: EventSink,
    onStatus: StatusSink,
    onCursor?: CursorSink,
    resume?: Cursor | null,
  ) {
    this.closed = false;
    this.pageToken = undefined;
    this.onCursor = onCursor ?? (() => {});


    const videoId = parseVideoId(settings.video);
    if (!settings.apiKey) {
      return onStatus({ state: "error", detailKey: "ytNeedApiKey" });
    }
    if (!videoId) {
      return onStatus({ state: "error", detailKey: "ytBadVideo" });
    }

    onStatus({ state: "connecting" });

    // Picking the stored page token back up is what makes a reload lossless:
    // YouTube replays from exactly where the last poll stopped.
    const carried = usableCursor(resume, videoId);
    if (carried) {
      this.pageToken = carried.pageToken;
      onStatus({ state: "live", detailKey: "ytResumed" });
      void this.poll(carried.liveChatId, videoId, settings, onEvent, onStatus);
      return;
    }

    let liveChatId: string;
    try {
      const res = await fetch(
        `${API}/videos?part=liveStreamingDetails&id=${videoId}&key=${settings.apiKey}`,
      );
      const body = await readJson<VideosResponse>(res);
      if (!res.ok) return onStatus(describeError(body, res.status));

      // These three failures look identical in a 200 response but mean very
      // different things, and telling them apart is the difference between
      // "fix your key" and "wait for the stream to start".
      const video = body.items?.[0];
      if (!video) {
        // No such video, or it is private — YouTube returns an empty list for
        // both rather than a 404.
        return onStatus({ state: "error", detailKey: "ytNoSuchVideo" });
      }
      if (!video.liveStreamingDetails) {
        return onStatus({ state: "error", detailKey: "ytNotLive" });
      }
      const id = video.liveStreamingDetails.activeLiveChatId;
      if (!id) {
        return onStatus({ state: "error", detailKey: "ytNoLiveChat" });
      }
      liveChatId = id;
    } catch {
      return onStatus({ state: "error", detailKey: "ytUnreachable" });
    }

    onStatus({ state: "live", detailKey: "ytReading" });
    void this.poll(liveChatId, videoId, settings, onEvent, onStatus);
  }

  disconnect() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(
    liveChatId: string,
    videoId: string,
    settings: YouTubeConnectConfig,
    onEvent: EventSink,
    onStatus: StatusSink,
  ) {
    if (this.closed) return;

    const params = new URLSearchParams({
      liveChatId,
      part: "snippet,authorDetails",
      maxResults: "200",
      key: settings.apiKey,
    });
    if (this.pageToken) params.set("pageToken", this.pageToken);

    let nextDelay = MIN_POLL_MS;

    try {
      const res = await fetch(`${LIVE_CHAT_MESSAGES}?${params}`);
      const body = await readJson<ChatResponse>(res);

      if (!res.ok) {
        onStatus(describeError(body, res.status));

        // A rejected page token means the resume point is stale. That is
        // recoverable: drop it and start clean rather than retrying something
        // YouTube will keep refusing.
        const staleCursor = res.status === 400 && this.pageToken !== undefined;
        if (staleCursor) {
          this.pageToken = undefined;
          this.onCursor(null);
        } else if (isTerminal(body, res.status)) {
          // Nothing to poll, or nothing polling can fix. Stopping matters:
          // a finished stream retried every 15s is thousands of requests a day
          // against a 10,000-unit budget, for messages that no longer exist.
          return;
        }

        nextDelay = 15_000;
      } else {
        this.pageToken = body.nextPageToken;
        this.onCursor({ videoId, liveChatId, pageToken: this.pageToken });
        const items = body.items ?? [];
        for (const item of items) {
          // Brought in by a donation service instead; taking it here too would
          // show it twice.
          if (settings.paidElsewhere && RELAYED_TYPES.has(item.snippet.type)) continue;
          const event = toStreamEvent(item);
          if (event) onEvent(event);
        }

        // The chat itself announcing that it closed. Everything up to it has
        // been delivered above; nothing can follow it.
        if (items.some((item) => item.snippet.type === "chatEndedEvent")) {
          onStatus(CHAT_ENDED);
          return;
        }

        if (body.offlineAt) {
          nextDelay = OFFLINE_POLL_MS;
          onStatus({ state: "live", detailKey: "ytStreamOffline" });
        } else {
          // Honour YouTube's own pacing hint; it knows the chat's rate.
          nextDelay = Math.max(MIN_POLL_MS, Number(body.pollingIntervalMillis) || MIN_POLL_MS);
          onStatus({ state: "live", detailKey: "ytReading" });
        }
      }
    } catch {
      onStatus({ state: "error", detailKey: "ytLostContact" });
      nextDelay = 15_000;
    }

    if (this.closed) return;
    this.timer = setTimeout(
      () => void this.poll(liveChatId, videoId, settings, onEvent, onStatus),
      nextDelay,
    );
  }
}

export function toStreamEvent(item: LiveChatMessage): StreamEvent | null {
  const s = item.snippet;
  const base = {
    id: `youtube:${item.id}`,
    platform: "youtube" as const,
    author: {
      name: item.authorDetails.displayName,
      avatarUrl: item.authorDetails.profileImageUrl,
    },
    timestamp: Date.parse(s.publishedAt) || Date.now(),
    raw: item,
  };

  switch (s.type) {
    case "textMessageEvent":
      return {
        ...base,
        kind: "chat",
        message: s.textMessageDetails?.messageText ?? s.displayMessage ?? "",
      };

    case "superChatEvent": {
      const d = s.superChatDetails;
      if (!d) return null;
      return {
        ...base,
        kind: "tip",
        message: d.userComment ?? "",
        amount: {
          value: fromMicros(d.amountMicros),
          currency: d.currency,
          display: d.amountDisplayString,
          tier: d.tier,
        },
      };
    }

    case "superStickerEvent": {
      const d = s.superStickerDetails;
      if (!d) return null;
      return {
        ...base,
        kind: "tip",
        // YouTube's product name, so it stays as-is in every language — the
        // same rule as bits and Kicks.
        message: d.superStickerMetadata?.altText ?? "Super Sticker",
        amount: {
          value: fromMicros(d.amountMicros),
          currency: d.currency,
          display: d.amountDisplayString,
          tier: d.tier,
        },
      };
    }

    case "newSponsorEvent": {
      const level = s.newSponsorDetails?.memberLevelName;
      return {
        ...base,
        kind: "subscription",
        // The level name is the channel's own wording, so it goes in untranslated.
        ...(level ? writtenText("ytNewMemberLevel", { level }) : writtenText("ytNewMember")),
        amount: { value: 1, currency: "SUBS" },
      };
    }

    case "membershipGiftingEvent": {
      const count = s.membershipGiftingDetails?.giftMembershipsCount ?? 1;
      return {
        ...base,
        kind: "subscription",
        ...(count === 1 ? writtenText("ytGiftedOne") : writtenText("ytGiftedMany", { count })),
        amount: { value: count, currency: "SUBS" },
      };
    }

    default:
      // Deletions, bans, poll updates, the chat closing and the like — nothing
      // to show in an inbox. The poll loop acts on chatEndedEvent itself.
      return null;
  }
}

/**
 * Reads a response as JSON without letting a non-JSON body throw.
 *
 * Google serves HTML for some failures — a wrong path 404s with a web page —
 * and a parse error thrown from here would surface as a network outage,
 * pointing at the wrong problem entirely.
 */
async function readJson<T>(res: Response): Promise<T> {
  try {
    return await res.json();
  } catch {
    return {
      error: { message: `YouTube returned ${res.status} (unreadable response).` },
    } as T;
  }
}

function errorReason(body: unknown): string | undefined {
  return (body as { error?: { errors?: Array<{ reason?: string }> } })?.error?.errors?.[0]?.reason;
}

/**
 * Whether polling should stop rather than retry.
 *
 * Retrying only helps when the next attempt could plausibly differ. A finished
 * chat never comes back, an exhausted quota does not refill before midnight,
 * and a key the API rejects will keep being rejected — so all three stop, and
 * the status says why. Turning the source off and on again restarts it.
 *
 * Rate limiting is deliberately not terminal: that one does clear on its own.
 */
export function isTerminal(body: unknown, status: number): boolean {
  const reason = errorReason(body);
  if (reason === "rateLimitExceeded") return false;
  if (reason === "quotaExceeded") return true;
  // 404: the chat is gone. 403/400: refused credentials or a bad request,
  // neither of which a retry changes.
  return status === 404 || status === 403 || status === 400;
}

/**
 * A chat that closed normally. Not an error — the stream is simply over — so
 * the source shows as disconnected, with the reason, rather than in red.
 */
const CHAT_ENDED: ConnectionStatus = { state: "disconnected", detailKey: "ytChatGone" };

export function describeError(body: unknown, status: number): ConnectionStatus {
  const err = (body as { error?: { message?: string; errors?: Array<{ reason?: string }> } })?.error;
  const reason = err?.errors?.[0]?.reason;

  // Both arrive as a 403, and would otherwise be shown as Google's raw
  // "forbidden" text — which reads like a key problem when nothing is wrong.
  if (reason === "liveChatEnded") return CHAT_ENDED;
  if (reason === "liveChatDisabled") return { state: "error", detailKey: "ytNoLiveChat" };

  // Quota exhaustion is the failure a streamer will actually hit, and the raw
  // message ("quota exceeded") gives no hint of what to do about it.
  if (reason === "quotaExceeded") return { state: "error", detailKey: "ytQuota" };
  if (reason === "rateLimitExceeded") return { state: "error", detailKey: "ytRateLimited" };
  if (reason === "forbidden" || status === 403) {
    return err?.message
      ? { state: "error", detail: err.message }
      : { state: "error", detailKey: "ytForbidden" };
  }
  if (status === 400) {
    return err?.message
      ? { state: "error", detail: err.message }
      : { state: "error", detailKey: "ytRejected" };
  }
  if (status === 404) return CHAT_ENDED;
  return { state: "error", detail: err?.message ?? `YouTube returned ${status}.` };
}
