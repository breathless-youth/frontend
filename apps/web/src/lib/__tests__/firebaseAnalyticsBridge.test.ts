import type { Types } from "@amplitude/analytics-browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FIREBASE_USER_PROPERTY_KEYS,
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

describe("toFirebaseAnalyticsMessage — 이벤트", () => {
  it("snake_case 이벤트를 파라미터와 함께 옮긴다 — boolean은 문자열로, 객체·null은 뺀다", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("study_session_ended", {
          event_properties: {
            room_type: "single",
            focus_sec: 600,
            will_submit: true,
            pause_trigger: null,
            nested: { a: 1 },
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

  it("문자열 값은 토큰만 통과한다 — 카탈로그의 에러 코드·정제된 경로·버전은 살고 자유 문자열은 죽는다", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("social_room_join_failed", {
          event_properties: {
            reason: "HTTP_404",
            path: "/room/:id",
            latest_version: "1.0.2",
            nickname: "포메12345",
            goal: "오늘 3시간 공부하기",
            sentence: "hello world",
            long_token: "x".repeat(65),
            empty: "",
          },
        }),
        5,
      ),
    ).toEqual({
      type: "analytics-event",
      name: "social_room_join_failed",
      params: { reason: "HTTP_404", path: "/room/:id", latest_version: "1.0.2" },
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

  it("파라미터는 25개까지만 남긴다", () => {
    const event_properties = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, i]));
    const message = toFirebaseAnalyticsMessage(event("many_params", { event_properties }), 5);
    expect(Object.keys((message as { params: object }).params)).toHaveLength(25);
  });

  it.each([
    "[Amplitude] Page Viewed",
    "[Amplitude] Element Clicked",
    "session_start",
    "session_end",
  ])("Amplitude 자체 이벤트(%s)는 보내지 않는다", (name) => {
    expect(toFirebaseAnalyticsMessage(event(name), 5)).toBeNull();
  });
});

describe("toFirebaseAnalyticsMessage — $identify 유저 속성", () => {
  it("화이트리스트 키만 옮긴다 — $set이 $setOnce를 이기고, 36자 초과·자유 문자열은 뺀다", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("$identify", {
          user_properties: {
            $setOnce: {
              initial_referrer: "https://example.com/a/very/long/path",
              acquisition_channel: "ads",
            },
            $set: {
              acquisition_channel: "preregister",
              camera_permission_granted: true,
              has_dday: false,
              dday_days_left: 7,
              theme: "dark",
              is_webview: true,
              app_version: "1.0.2",
              utm_source: "kakao",
            },
          },
        }),
        5,
      ),
    ).toEqual({
      type: "analytics-user-properties",
      properties: {
        acquisition_channel: "preregister",
        camera_permission_granted: "true",
        has_dday: "false",
        dday_days_left: "7",
      },
      atMs: 5,
    });
  });

  it("$unset은 null로 옮긴다 — GA 쪽 값을 지워 Amplitude와 어긋나지 않게", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("$identify", {
          user_properties: { $set: { has_dday: false }, $unset: { dday_days_left: "-" } },
        }),
        5,
      ),
    ).toEqual({
      type: "analytics-user-properties",
      properties: { has_dday: "false", dday_days_left: null },
      atMs: 5,
    });
  });

  it("옮길 속성이 없으면 null", () => {
    expect(
      toFirebaseAnalyticsMessage(
        event("$identify", { user_properties: { $set: { theme: "dark" }, $unset: { x: "-" } } }),
        5,
      ),
    ).toBeNull();
  });

  it("화이트리스트는 오디언스 조건이 될 만한 속성만이다 — 늘리면 GA 맞춤 정의 등록도 필요하다", () => {
    expect(FIREBASE_USER_PROPERTY_KEYS).toEqual([
      "acquisition_channel",
      "camera_permission_granted",
      "has_dday",
      "dday_days_left",
    ]);
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
