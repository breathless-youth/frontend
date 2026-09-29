import type { Types } from "@amplitude/analytics-browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  firebaseAnalyticsForwardPlugin,
  toFirebaseAnalyticsMessage,
} from "@/lib/firebaseAnalyticsBridge";

/**
 * Amplitude 이벤트 → 네이티브 Firebase Analytics 브리지 메시지. 네이티브 `parseToNativeMessage`가 받는 모양
 * (`apps/mobile/lib/webBridge.ts`)과 대칭이다 — 여기서 걸러진 값은 네이티브도 버린다.
 */

const event = (event_type: string, rest: Partial<Types.Event> = {}): Types.Event =>
  ({ event_type, ...rest }) as Types.Event;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toFirebaseAnalyticsMessage", () => {
  it("snake_case 이벤트를 파라미터와 함께 옮긴다 — boolean은 문자열로, 객체·null·긴 문자열은 뺀다", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("study_session_ended", {
          event_properties: {
            room_type: "single",
            focus_sec: 600,
            will_submit: true,
            pause_trigger: null,
            nested: { a: 1 },
            long: "x".repeat(101),
            source: "native",
          },
        }),
        5,
      ),
    ).toEqual({
      type: "analytics-event",
      name: "study_session_ended",
      params: { room_type: "single", focus_sec: 600, will_submit: "true", source: "native" },
      atMs: 5,
    });
  });

  it("파라미터가 없으면 params 필드를 만들지 않는다", () => {
    expect(toFirebaseAnalyticsMessage(event("app_launched"), 5)).toEqual({
      type: "analytics-event",
      name: "app_launched",
      atMs: 5,
    });
  });

  it.each([
    "[Amplitude] Page Viewed",
    "[Amplitude] Element Clicked",
    "session_start",
    "session_end",
  ])("Amplitude 자체 이벤트(%s)는 보내지 않는다", (name) => {
    expect(toFirebaseAnalyticsMessage(event(name), 5)).toBeNull();
  });

  it("$identify는 $set·$setOnce를 유저 속성으로 옮긴다 — 같은 키면 $set이 이긴다, 36자 초과는 뺀다", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("$identify", {
          user_properties: {
            $setOnce: {
              initial_referrer: "https://example.com/a/very/long/path/that/exceeds",
              acquisition_channel: "ads",
            },
            $set: { theme: "dark", is_webview: true, acquisition_channel: "preregister" },
            $unset: { gone: "-" },
          },
        }),
        5,
      ),
    ).toEqual({
      type: "analytics-user-properties",
      properties: { acquisition_channel: "preregister", theme: "dark", is_webview: "true" },
      atMs: 5,
    });
  });

  it("$identify에 옮길 속성이 없으면 null", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("$identify", { user_properties: { $unset: { x: "-" } } }),
        5,
      ),
    ).toBeNull();
  });
});

describe("firebaseAnalyticsForwardPlugin", () => {
  it("destination 플러그인이 브리지로 메시지를 보내고 이벤트는 그대로 돌려준다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const plugin = firebaseAnalyticsForwardPlugin();
    const input = event("study_session_started", {
      event_properties: { room_type: "single" },
      time: 42,
    });

    const result = await plugin.execute(input);

    expect(result.event).toBe(input);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string)).toEqual({
      type: "analytics-event",
      name: "study_session_started",
      params: { room_type: "single" },
      atMs: 42,
    });
  });

  it("보낼 것이 없는 이벤트는 브리지를 부르지 않는다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    await firebaseAnalyticsForwardPlugin().execute(event("[Amplitude] Page Viewed"));

    expect(postMessage).not.toHaveBeenCalled();
  });
});
