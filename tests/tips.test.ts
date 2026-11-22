import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StreamlabsAdapter,
  streamlabsEventToStreamEvents,
} from "@/lib/adapters/streamlabs";
import {
  StreamElementsAdapter,
  streamElementsEventToStreamEvent,
} from "@/lib/adapters/streamelements";
import { translate } from "@/lib/i18n";
import { formatAmount } from "@/lib/money";
import type { ConnectionStatus, StreamEvent } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Payload mapping                                                     */
/* ------------------------------------------------------------------ */

describe("Streamlabs donations", () => {
  // The exact payload Streamlabs publishes in its Socket API docs.
  const documented = {
    type: "donation",
    message: [
      {
        id: 96164121,
        name: "test",
        amount: "13.37",
        formatted_amount: "$13.37",
        formattedAmount: "$13.37",
        message: "test donation",
        currency: "USD",
        from: "test",
        _id: "0820c9d5bafd768c9843f5e35c885e71",
      },
    ],
    event_id: "evt_17e5f4dc6888767ed9799f78dfa2cabc",
  };

  it("maps the documented payload", () => {
    const [event] = streamlabsEventToStreamEvents(documented);
    expect(event).toMatchObject({
      id: "streamlabs:0820c9d5bafd768c9843f5e35c885e71",
      platform: "streamlabs",
      kind: "tip",
      author: { name: "test" },
      message: "test donation",
      amount: { value: 13.37, currency: "USD", display: "$13.37" },
    });
  });

  it("uses the currency the platform sends, never a guess", () => {
    const [event] = streamlabsEventToStreamEvents({
      type: "donation",
      message: [{ _id: "a", name: "n", amount: "2000", currency: "ars", message: "" }],
    });
    expect(event.amount).toMatchObject({ value: 2000, currency: "ARS" });
    // And it renders as ARS, not converted to anything.
    expect(formatAmount(event.amount!, "en-US")).toContain("ARS");
  });

  it("handles several donations in one frame", () => {
    const events = streamlabsEventToStreamEvents({
      type: "donation",
      message: [
        { _id: "a", name: "one", amount: "1", currency: "USD" },
        { _id: "b", name: "two", amount: "2", currency: "USD" },
      ],
    });
    expect(events.map((e) => e.id)).toEqual(["streamlabs:a", "streamlabs:b"]);
  });

  it("falls back to `from` when there is no name", () => {
    const [event] = streamlabsEventToStreamEvents({
      type: "donation",
      message: [{ _id: "a", from: "someone", amount: "1", currency: "USD" }],
    });
    expect(event.author.name).toBe("someone");
  });

  it("labels a donation with neither name nor sender", () => {
    const [event] = streamlabsEventToStreamEvents({
      type: "donation",
      message: [{ _id: "a", amount: "1", currency: "USD" }],
    });
    expect(event.author.name).toBe("Anonymous");
  });

  it("drops a donation whose amount cannot be read, rather than inventing one", () => {
    expect(
      streamlabsEventToStreamEvents({
        type: "donation",
        message: [{ _id: "a", name: "n", amount: "not-a-number", currency: "USD" }],
      }),
    ).toEqual([]);
  });

  it("defaults to USD only when no currency is given at all", () => {
    const [event] = streamlabsEventToStreamEvents({
      type: "donation",
      message: [{ _id: "a", name: "n", amount: "5" }],
    });
    expect(event.amount?.currency).toBe("USD");
  });

  it.each([
    ["a follow", { type: "follow", message: [{ name: "x" }] }],
    ["a subscription", { type: "subscription", message: [{ name: "x" }] }],
    ["an empty frame", {}],
    ["nothing at all", undefined],
  ])("ignores %s", (_label, frame) => {
    // Subs and follows already arrive first-hand from Twitch and YouTube.
    expect(streamlabsEventToStreamEvents(frame)).toEqual([]);
  });

  it("copes with a single object instead of a list", () => {
    const events = streamlabsEventToStreamEvents({
      type: "donation",
      message: { _id: "a", name: "n", amount: "1", currency: "USD" },
    });
    expect(events).toHaveLength(1);
  });
});

describe("YouTube through Streamlabs", () => {
  // The shapes from Streamlabs' Socket API docs, field for field.
  const superchat = {
    type: "superchat",
    for: "youtube_account",
    message: [
      {
        id: "LCC.Cg8KDQoLabc",
        channelId: "UCxyz",
        channelUrl: "http://www.youtube.com/channel/UCxyz",
        name: "Kappa Lord",
        comment: "love the stream",
        amount: "2000000",
        currency: "USD",
        displayString: "$2.00",
        messageType: 2,
        createdAt: "2017-08-22 00:51:57",
        _id: "s1",
      },
    ],
  };
  const sponsor = (months: number) => ({
    type: "subscription",
    for: "youtube_account",
    message: [
      {
        sponsorSince: "2017-08-22 00:45:48",
        id: "UCec4hVEu3ZXE8qlRtUeK0DA",
        name: "Kappa Lord",
        channelUrl: "http://www.youtube.com/channel/UCec4hVEu3ZXE8qlRtUeK0DA",
        months,
        _id: "m1",
      },
    ],
  });
  const relay = { youtube: true };

  it("maps a Super Chat as a YouTube tip, amount read from micros", () => {
    const [event] = streamlabsEventToStreamEvents(superchat, relay);
    expect(event).toMatchObject({
      platform: "youtube",
      kind: "tip",
      author: { name: "Kappa Lord" },
      message: "love the stream",
      amount: { value: 2, currency: "USD", display: "$2.00", tier: 2 },
    });
    expect(event.id).toBe("youtube:streamlabs:LCC.Cg8KDQoLabc");
  });

  it("drops a Super Chat without a currency rather than assuming one", () => {
    const noCurrency = { ...superchat.message[0], currency: undefined };
    expect(streamlabsEventToStreamEvents({ ...superchat, message: [noCurrency] }, relay)).toEqual([]);
  });

  it("keeps the row neutral when the band is not one YouTube has", () => {
    for (const messageType of [0, 8, 2.5, undefined]) {
      const [event] = streamlabsEventToStreamEvents(
        { ...superchat, message: [{ ...superchat.message[0], messageType }] },
        relay,
      );
      expect(event.amount?.tier).toBeUndefined();
    }
  });

  it("maps a new member and a returning one, in the chosen language", () => {
    const [fresh] = streamlabsEventToStreamEvents(sponsor(1), relay);
    expect(fresh).toMatchObject({ platform: "youtube", kind: "subscription", messageKey: "ytNewMember" });
    expect(fresh.amount).toEqual({ value: 1, currency: "SUBS" });

    const [returning] = streamlabsEventToStreamEvents(sponsor(3), relay);
    expect(returning.message).toBe("Member for 3 months");
    expect(translate("es", returning.messageKey!, returning.messageVars)).toBe(
      "Miembro desde hace 3 meses",
    );
  });

  it("ignores YouTube events unless YouTube is set to arrive this way", () => {
    // Otherwise the YouTube adapter already reports them, and they'd show twice.
    expect(streamlabsEventToStreamEvents(superchat)).toEqual([]);
    expect(streamlabsEventToStreamEvents(sponsor(1), { youtube: false })).toEqual([]);
  });

  it("ignores YouTube channel subscriptions, which the feed doesn't show", () => {
    const follow = { type: "follow", for: "youtube_account", message: [{ id: "x", name: "n" }] };
    expect(streamlabsEventToStreamEvents(follow, relay)).toEqual([]);
  });

  it("still ignores Twitch subs when relaying YouTube", () => {
    const twitchSub = { type: "subscription", for: "twitch_account", message: [{ name: "x", months: 2 }] };
    expect(streamlabsEventToStreamEvents(twitchSub, relay)).toEqual([]);
  });
});

describe("Twitch through Streamlabs", () => {
  // The shapes from Streamlabs' Socket API docs.
  const bits = {
    type: "bits",
    for: "twitch_account",
    message: [
      {
        id: "fc546f7d-aab8-42b2-9933-8681e9fb5eb0",
        name: "h4r5h48002",
        amount: "1",
        emotes: null,
        message: "streamlabs1",
        _id: "74a0b93e736f1f14762111f8ae34bf42",
      },
    ],
  };
  const sub = (fields: Record<string, unknown>) => ({
    type: "subscription",
    for: "twitch_account",
    message: [
      {
        name: "kevin",
        months: 7,
        message: "sub message",
        emotes: null,
        sub_plan: "1000",
        sub_plan_name: "Sample Plan name",
        sub_type: "resub",
        _id: "a226a8c223634afdc368439c1da7aaba",
        ...fields,
      },
    ],
  });
  const relay = { twitch: true };

  it("maps bits as a Twitch tip, with the cheermote band", () => {
    const [event] = streamlabsEventToStreamEvents(
      { ...bits, message: [{ ...bits.message[0], amount: "1000" }] },
      relay,
    );
    expect(event).toMatchObject({
      platform: "twitch",
      kind: "tip",
      author: { name: "h4r5h48002" },
      message: "streamlabs1",
      amount: { value: 1000, currency: "BITS" },
    });
    // 1000 bits is Twitch's third cheermote band.
    expect(event.amount?.tier).toBe(3);
  });

  it("drops bits without a readable count", () => {
    for (const amount of ["", "abc", "0"]) {
      expect(
        streamlabsEventToStreamEvents({ ...bits, message: [{ ...bits.message[0], amount }] }, relay),
      ).toEqual([]);
    }
  });

  it("maps a sub, keeping the viewer's own message", () => {
    const [event] = streamlabsEventToStreamEvents(sub({}), relay);
    expect(event).toMatchObject({
      platform: "twitch",
      kind: "subscription",
      author: { name: "kevin" },
      message: "sub message",
      amount: { value: 1, currency: "SUBS" },
    });
    expect(event.messageKey).toBeUndefined();
  });

  it("writes its own text, translated, when the viewer left none", () => {
    const [resub] = streamlabsEventToStreamEvents(sub({ message: "" }), relay);
    expect(resub.message).toBe("Resubscribed for 7 months");

    const [fresh] = streamlabsEventToStreamEvents(
      sub({ message: "", months: 1, sub_type: "sub", sub_plan: "2000" }),
      relay,
    );
    expect(fresh.message).toBe("Subscribed at tier 2");
    expect(translate("es", fresh.messageKey!, fresh.messageVars)).toBe("Se suscribió con nivel 2");
  });

  it("leaves gifted subs to the Twitch connection, which reports a bundle once", () => {
    expect(streamlabsEventToStreamEvents(sub({ sub_type: "subgift" }), relay)).toEqual([]);
  });

  it("ignores Twitch events unless asked to bring them in", () => {
    expect(streamlabsEventToStreamEvents(bits)).toEqual([]);
    expect(streamlabsEventToStreamEvents(sub({}), { youtube: true })).toEqual([]);
  });

  it("never brings in follows or raids", () => {
    for (const type of ["follow", "raid", "host"]) {
      expect(
        streamlabsEventToStreamEvents({ type, for: "twitch_account", message: [{ name: "x" }] }, relay),
      ).toEqual([]);
    }
  });
});

describe("StreamElements tips", () => {
  const tip = {
    _id: "abc123",
    type: "tip",
    createdAt: "2026-08-17T12:00:00Z",
    data: {
      username: "nadia",
      displayName: "Nadia",
      amount: 5,
      currency: "ARS",
      message: "gracias!",
      tipId: "tip_1",
    },
  };

  it("maps a tip", () => {
    const event = streamElementsEventToStreamEvent(tip)!;
    expect(event).toMatchObject({
      id: "streamelements:tip_1",
      platform: "streamelements",
      kind: "tip",
      author: { name: "Nadia" },
      message: "gracias!",
      amount: { value: 5, currency: "ARS" },
    });
    expect(event.timestamp).toBe(Date.parse("2026-08-17T12:00:00Z"));
  });

  it("falls back to the username when there is no display name", () => {
    const event = streamElementsEventToStreamEvent({
      ...tip,
      data: { ...tip.data, displayName: undefined },
    })!;
    expect(event.author.name).toBe("nadia");
  });

  it("falls back to the record id when there is no tip id", () => {
    const event = streamElementsEventToStreamEvent({
      ...tip,
      data: { ...tip.data, tipId: undefined },
    })!;
    expect(event.id).toBe("streamelements:abc123");
  });

  it("uses now when the timestamp is unusable", () => {
    const event = streamElementsEventToStreamEvent({ ...tip, createdAt: "nonsense" })!;
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("drops a tip with an unreadable amount", () => {
    expect(
      streamElementsEventToStreamEvent({ ...tip, data: { ...tip.data, amount: undefined } }),
    ).toBeNull();
  });

  it.each([
    ["a follow", { type: "follow", data: {} }],
    ["a subscriber", { type: "subscriber", data: {} }],
    ["nothing at all", undefined],
  ])("ignores %s", (_label, frame) => {
    expect(streamElementsEventToStreamEvent(frame)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Connecting                                                          */
/* ------------------------------------------------------------------ */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  deliver(frame: string) {
    this.onmessage?.({ data: frame });
  }
  /** The handshake both services send on connect. */
  handshake() {
    this.deliver('0{"sid":"s1","pingInterval":25000,"pingTimeout":60000}');
  }
}

function sinks() {
  const events: StreamEvent[] = [];
  const statuses: ConnectionStatus[] = [];
  return {
    events,
    statuses,
    onEvent: (e: StreamEvent) => events.push(e),
    onStatus: (s: ConnectionStatus) => statuses.push(s),
    last: () => statuses.at(-1)!,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StreamlabsAdapter", () => {
  it("asks for a token before opening anything", async () => {
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "  " }, s.onEvent, s.onStatus);

    expect(s.last()).toEqual({ state: "error", detailKey: "slNeedToken" });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("connects with the token in the query and no server in between", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "tok123" }, s.onEvent, s.onStatus);

    const url = new URL(FakeWebSocket.instances[0].url);
    expect(url.host).toBe("sockets.streamlabs.com");
    expect(url.searchParams.get("token")).toBe("tok123");
    expect(url.searchParams.get("transport")).toBe("websocket");
    expect(fetchSpy).not.toHaveBeenCalled();
    adapter.disconnect();
  });

  it("goes live on handshake and emits the donations that follow", async () => {
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "t" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    expect(s.last()).toEqual({ state: "live", detailKey: "slReading" });

    socket.deliver(
      '42["event",{"type":"donation","message":[{"_id":"d1","name":"pili","amount":"500","currency":"ARS","message":"un cafecito"}]}]',
    );
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({
      id: "streamlabs:d1",
      amount: { value: 500, currency: "ARS" },
    });
    adapter.disconnect();
  });

  it("keeps the connection alive on its own, as engine version 3 requires", async () => {
    vi.useFakeTimers();
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "t" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    expect(socket.sent).not.toContain("2");

    vi.advanceTimersByTime(25_000);
    expect(socket.sent).toContain("2");
    adapter.disconnect();
  });

  it("stops the heartbeat when disconnected", async () => {
    vi.useFakeTimers();
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "t" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    adapter.disconnect();
    const settled = socket.sent.length;

    vi.advanceTimersByTime(120_000);
    expect(socket.sent).toHaveLength(settled);
  });

  it("does not reconnect after an intentional disconnect", async () => {
    const s = sinks();
    const adapter = new StreamlabsAdapter();
    await adapter.connect({ socketToken: "t" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    adapter.disconnect();
    socket.onclose?.();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("StreamElementsAdapter", () => {
  it("asks for a token before opening anything", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "", method: "jwt" }, s.onEvent, s.onStatus);

    expect(s.last()).toEqual({ state: "error", detailKey: "seNeedToken" });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("keeps the token out of the URL and authenticates after connecting", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "jwt-abc", method: "jwt" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).not.toContain("jwt-abc");

    socket.handshake();
    expect(JSON.parse(socket.sent[0].slice(2))).toEqual([
      "authenticate",
      { method: "jwt", token: "jwt-abc" },
    ]);
    adapter.disconnect();
  });

  it("passes the overlay method through when chosen", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "ov", method: "apikey" }, s.onEvent, s.onStatus);

    FakeWebSocket.instances[0].handshake();
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0].slice(2))[1]).toEqual({
      method: "apikey",
      token: "ov",
    });
    adapter.disconnect();
  });

  it("is not live until authentication succeeds", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "t", method: "jwt" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    // Connected, but nothing flows yet.
    expect(s.last().state).toBe("connecting");

    socket.deliver('42["authenticated",{"channelId":"c1"}]');
    expect(s.last()).toEqual({ state: "live", detailKey: "seReading" });
    adapter.disconnect();
  });

  it("reports a rejected token clearly", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "bad", method: "jwt" }, s.onEvent, s.onStatus);

    FakeWebSocket.instances[0].handshake();
    FakeWebSocket.instances[0].deliver('42["unauthorized",{}]');
    expect(s.last()).toEqual({ state: "error", detailKey: "seUnauthorized" });
    adapter.disconnect();
  });

  it("emits tips once authenticated", async () => {
    const s = sinks();
    const adapter = new StreamElementsAdapter();
    await adapter.connect({ token: "t", method: "jwt" }, s.onEvent, s.onStatus);

    const socket = FakeWebSocket.instances[0];
    socket.handshake();
    socket.deliver('42["authenticated",{}]');
    socket.deliver(
      '42["event",{"_id":"e1","type":"tip","createdAt":"2026-08-17T12:00:00Z","data":{"username":"rocioo","amount":250,"currency":"ARS","message":"grande"}}]',
    );

    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({
      id: "streamelements:e1",
      amount: { value: 250, currency: "ARS" },
      author: { name: "rocioo" },
    });
    adapter.disconnect();
  });
});
