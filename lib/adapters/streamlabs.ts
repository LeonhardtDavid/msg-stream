import { writtenText } from "../i18n";
import { fromMicros } from "../money";
import { SocketIoClient, socketUrl } from "./socketio";
import { bitsAmount, tierName } from "./twitch";
import type {
  EventSink,
  Platform,
  SourceAdapter,
  StatusSink,
  StreamEvent,
  StreamlabsSettings,
} from "../types";

const STREAMLABS_SOCKET = "https://sockets.streamlabs.com";

/**
 * Streamlabs' Socket API — the documented realtime feed for a channel's own
 * events, designed for browser overlays. Because it runs over the websocket
 * transport there is no polling handshake and therefore no CORS involved, so
 * this connects straight from the page with no server anywhere.
 *
 * This is also how Ceneka donations arrive: Ceneka has no realtime channel of
 * its own and pushes into whichever of Streamlabs or StreamElements the
 * streamer linked, so reading Streamlabs reads Ceneka too — along with every
 * other source routed through the same account.
 *
 * The token is the "Socket API Token" from Streamlabs' dashboard, under
 * Account Settings → API Settings → API Tokens.
 */
export class StreamlabsAdapter implements SourceAdapter<StreamlabsSettings> {
  platform: Platform = "streamlabs";
  private client: SocketIoClient | null = null;
  private closed = false;

  async connect(settings: StreamlabsSettings, onEvent: EventSink, onStatus: StatusSink) {
    this.closed = false;

    const token = settings.socketToken.trim();
    if (!token) return onStatus({ state: "error", detailKey: "slNeedToken" });

    onStatus({ state: "connecting" });

    // Streamlabs runs Socket.IO v2, i.e. Engine.IO 3.
    this.client = new SocketIoClient(socketUrl(STREAMLABS_SOCKET, 3, { token }), 3, {
      onConnect: () => onStatus({ state: "live", detailKey: "slReading" }),
      onEvent: (name, args) => {
        if (name !== "event") return;
        const options = settings.relay ?? {};
        for (const event of streamlabsEventToStreamEvents(args[0], options)) onEvent(event);
      },
      onError: () => {
        if (!this.closed) onStatus({ state: "error", detailKey: "slSocketError" });
      },
      onDropped: () => {
        if (this.closed) return;
        onStatus({ state: "connecting", detailKey: "slReconnecting" });
        setTimeout(() => {
          if (!this.closed) this.client?.connect();
        }, 2000);
      },
    });

    this.client.connect();
  }

  disconnect() {
    this.closed = true;
    this.client?.close();
    this.client = null;
  }
}

interface StreamlabsDonation {
  id?: number | string;
  _id?: string;
  name?: string;
  from?: string;
  amount?: string | number;
  formatted_amount?: string;
  formattedAmount?: string;
  currency?: string;
  message?: string;
}

/** A YouTube Super Chat as Streamlabs relays it, per its Socket API docs. */
interface StreamlabsSuperChat {
  id?: string;
  _id?: string;
  name?: string;
  comment?: string;
  /** Millionths of the currency unit, as a string: "2000000" is $2.00. */
  amount?: string | number;
  currency?: string;
  displayString?: string;
  /** YouTube's Super Chat band: 2 for that $2.00 example. */
  messageType?: number;
}

/** A new or returning YouTube member, as Streamlabs relays it. */
interface StreamlabsSponsor {
  id?: string;
  _id?: string;
  name?: string;
  months?: number;
}

/** Twitch bits as Streamlabs relays them. */
interface StreamlabsBits {
  id?: string;
  _id?: string;
  name?: string;
  /** A string in the documented example: "1". */
  amount?: string | number;
  /** The cheer's own text. */
  message?: string;
}

/** A Twitch sub or resub as Streamlabs relays it. */
interface StreamlabsTwitchSub {
  _id?: string;
  name?: string;
  months?: number;
  message?: string;
  /** "1000" / "2000" / "3000", as in EventSub. */
  sub_plan?: string;
  /** "resub" in the documented example; nothing documents a gift. */
  sub_type?: string;
}

/** How many bands YouTube's Super Chat ladder has (see lib/tiers.ts). */
const YOUTUBE_BANDS = 7;

/**
 * Maps one Streamlabs socket payload to StreamEvents.
 *
 * Returns an array because Streamlabs batches: `message` is always a list, and
 * a single frame can carry several donations.
 *
 * Donations are always mapped. A linked platform's paid events — YouTube Super
 * Chats and members, Twitch bits and subs — only when the streamer asked for
 * them here: otherwise that platform's own connection reports them, and taking
 * them here as well would show them twice. Follows, hosts and raids never.
 */
export function streamlabsEventToStreamEvents(
  raw: unknown,
  options: { youtube?: boolean; twitch?: boolean } = {},
): StreamEvent[] {
  const frame = raw as { type?: string; for?: string; message?: unknown } | undefined;
  if (!frame) return [];

  const items = Array.isArray(frame.message) ? frame.message : [frame.message];

  if (frame.for === "youtube_account") {
    if (!options.youtube) return [];
    if (frame.type === "superchat") return youtubeSuperChats(items as StreamlabsSuperChat[]);
    if (frame.type === "subscription") return youtubeSponsors(items as StreamlabsSponsor[]);
    // "follow" is a YouTube channel subscription, which this app doesn't show.
    return [];
  }

  if (frame.for === "twitch_account") {
    if (!options.twitch) return [];
    if (frame.type === "bits") return twitchBits(items as StreamlabsBits[]);
    if (frame.type === "subscription") return twitchSubs(items as StreamlabsTwitchSub[]);
    // Follows, hosts and raids aren't shown.
    return [];
  }

  if (frame.type !== "donation") return [];

  const events: StreamEvent[] = [];

  for (const item of items as StreamlabsDonation[]) {
    if (!item) continue;

    const value = Number(item.amount);
    // A donation with no readable amount is not something to put on screen as
    // money; skipping beats inventing a figure.
    if (!Number.isFinite(value)) continue;

    const id = item._id ?? item.id;
    events.push({
      id: `streamlabs:${id ?? `${item.name ?? "anon"}:${value}:${Date.now()}`}`,
      platform: "streamlabs",
      kind: "tip",
      author: { name: item.name ?? item.from ?? "Anonymous" },
      message: item.message ?? "",
      amount: {
        value,
        // Streamlabs sends the real currency code, so nothing is inferred here.
        currency: (item.currency ?? "USD").toUpperCase(),
        display: item.formatted_amount ?? item.formattedAmount,
      },
      timestamp: Date.now(),
      raw: item,
    });
  }

  return events;
}

/**
 * Super Chats arrive as YouTube events, so they keep YouTube's colour and its
 * Super Chat band exactly as if read from the API.
 */
function youtubeSuperChats(items: StreamlabsSuperChat[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const item of items) {
    if (!item) continue;
    const micros = Number(item.amount);
    // No readable amount or no currency means nothing trustworthy to show as
    // money — and unlike a Streamlabs donation, there is no default currency
    // to fall back on for a YouTube viewer paying in their own.
    if (!Number.isFinite(micros) || !item.currency) continue;

    const band = item.messageType;
    const id = item.id ?? item._id;
    events.push({
      id: `youtube:streamlabs:${id ?? `${item.name ?? "anon"}:${micros}:${Date.now()}`}`,
      platform: "youtube",
      kind: "tip",
      author: { name: item.name ?? "Anonymous" },
      message: item.comment ?? "",
      amount: {
        value: fromMicros(micros),
        currency: item.currency.toUpperCase(),
        display: item.displayString,
        // Only a band YouTube's ladder actually has; anything else stays neutral.
        tier: Number.isInteger(band) && band! >= 1 && band! <= YOUTUBE_BANDS ? band : undefined,
      },
      // Streamlabs' `createdAt` has no time zone, so it can't be trusted to
      // place the event; arrival time is accurate to within a moment.
      timestamp: Date.now(),
      raw: item,
    });
  }
  return events;
}

function youtubeSponsors(items: StreamlabsSponsor[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const item of items) {
    if (!item) continue;
    const months = Number(item.months ?? 1);
    const id = item._id ?? item.id;
    events.push({
      id: `youtube:streamlabs:member:${id ?? `${item.name ?? "anon"}:${Date.now()}`}`,
      platform: "youtube",
      kind: "subscription",
      author: { name: item.name ?? "Someone" },
      ...(months > 1 ? writtenText("ytMemberMonths", { months }) : writtenText("ytNewMember")),
      amount: { value: 1, currency: "SUBS" },
      timestamp: Date.now(),
      raw: item,
    });
  }
  return events;
}

/** Bits keep Twitch's colour and its cheermote band, as if read first-hand. */
function twitchBits(items: StreamlabsBits[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const item of items) {
    if (!item) continue;
    const bits = Number(item.amount);
    if (!Number.isFinite(bits) || bits <= 0) continue;
    const id = item.id ?? item._id;
    events.push({
      id: `twitch:streamlabs:${id ?? `${item.name ?? "anon"}:${bits}:${Date.now()}`}`,
      platform: "twitch",
      kind: "tip",
      author: { name: item.name ?? "Anonymous" },
      message: item.message ?? "",
      amount: bitsAmount(bits),
      timestamp: Date.now(),
      raw: item,
    });
  }
  return events;
}

function twitchSubs(items: StreamlabsTwitchSub[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const item of items) {
    if (!item) continue;
    // Gifts stay with the Twitch connection, which reports a bundle as one
    // event; Streamlabs doesn't document how it shows them, and one row per
    // recipient here would double them up.
    if (item.sub_type?.toLowerCase().includes("gift")) continue;

    const months = Number(item.months ?? 1);
    const tier = tierName(item.sub_plan ?? "1000");
    const text = item.message?.trim();
    events.push({
      id: `twitch:streamlabs:sub:${item._id ?? `${item.name ?? "anon"}:${Date.now()}`}`,
      platform: "twitch",
      kind: "subscription",
      author: { name: item.name ?? "Someone" },
      // The viewer's own sub message wins, as on the Twitch connection.
      ...(text
        ? { message: text }
        : months > 1
          ? writtenText("subResubscribed", { months })
          : writtenText("subSubscribedTier", { tier })),
      amount: { value: 1, currency: "SUBS" },
      timestamp: Date.now(),
      raw: item,
    });
  }
  return events;
}
