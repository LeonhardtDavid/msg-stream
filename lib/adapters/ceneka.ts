import type {
  CenekaSettings,
  EventSink,
  Platform,
  SourceAdapter,
  StatusSink,
} from "../types";

/**
 * Ceneka (ceneka.net) is a donations platform with no realtime API, webhooks or
 * alert transport of its own. It forwards each donation to the Streamlabs or
 * StreamElements account the streamer linked in their Ceneka panel, so its
 * donations reach the feed through those adapters, not this one.
 *
 * This adapter only keeps Ceneka in the source list and tells the user to turn
 * on Streamlabs or StreamElements. A direct connection was investigated and
 * rejected: the public donations endpoint sends no CORS headers and has no
 * currency field. See "Ceneka arrives through Streamlabs or StreamElements" in
 * the README.
 */
export class CenekaAdapter implements SourceAdapter<CenekaSettings> {
  platform: Platform = "ceneka";

  async connect(_config: CenekaSettings, _onEvent: EventSink, onStatus: StatusSink) {
    onStatus({
      state: "unavailable",
      detailKey: "cenekaUnavailable",
    });
  }

  disconnect() {
    // Nothing to tear down.
  }
}
