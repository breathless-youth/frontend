import type { Types } from "@amplitude/analytics-browser";

import type {
  AnalyticsEventMessage,
  AnalyticsEventParamValue,
  AnalyticsUserPropertiesMessage,
} from "@focusmakers/types";
import {
  ANALYTICS_EVENT_MAX_PARAMS,
  ANALYTICS_NAME_PATTERN,
  ANALYTICS_PARAM_VALUE_PATTERN,
  ANALYTICS_USER_PROPERTY_VALUE_MAX_LENGTH,
} from "@focusmakers/types";

import { postToNative } from "./bridge";

/**
 * Amplitude 전송 파이프라인의 끝(destination 플러그인)에서 같은 이벤트를 네이티브 Firebase Analytics(GA4)에도
 * 보낸다 — FCM 콘솔의 오디언스·유저 속성 타겟팅은 Firebase Analytics 데이터만 보기 때문이다
 * (`docs/adr/0010-native-firebase-analytics-for-push-targeting.md`).
 *
 * **이벤트 이름은 Amplitude 카탈로그 전체가 그대로 흐른다** — 세그먼트에 어떤 이벤트가 필요할지 미리 알 수 없고,
 * 목록을 따로 두면 두 카탈로그가 갈라진다. 대신 **값**은 좁힌다. 규칙의 원천은 `packages/types`의 `ANALYTICS_*`
 * 상수이고 네이티브(`apps/mobile/lib/webBridge.ts`)가 같은 값으로 다시 거른다.
 *
 * - 이름·파라미터 키: `ANALYTICS_NAME_PATTERN` → `[Amplitude] …` autocapture 이벤트는 자연히 빠진다.
 * - 값: 문자열은 토큰만(`ANALYTICS_PARAM_VALUE_PATTERN` — enum·에러 코드·정제된 경로·버전), 수는 유한수.
 *   boolean은 "true"/"false"로 접는다(Firebase는 문자열·수만 받는다). 객체·배열·null·자유 문자열은 뺀다.
 *   현재 카탈로그의 문자열 속성은 전부 이 꼴이다(`reason`은 서버 코드·`HTTP_{status}`, `path`는
 *   `sanitizePagePath` 결과, `route`는 쿼리를 뗀 앱 경로). 닉네임·목표 문구·초대코드가 실수로 실려도 여기서 걸린다.
 * - 파라미터는 25개까지. Amplitude 자체 세션 이벤트는 보내지 않는다 — Firebase는 세션을 따로 세고
 *   `session_start`는 예약이라 SDK가 거부한다.
 * - `$identify`는 **`FIREBASE_USER_PROPERTY_KEYS`만** 유저 속성으로 옮긴다. `$set`·`$setOnce`는 값,
 *   `$unset`은 `null`(Firebase가 속성을 지운다). 오디언스 조건에 쓸 것만 고른 이유는 GA4의 커스텀 유저
 *   속성 한도가 25개라서다 — attribution이 만드는 `utm_*`·`referrer`가 한도를 먹으면 안 된다.
 *
 * 브라우저 단독 모드에서는 `postToNative`가 조용히 버린다. URL 정제(`sanitizeUrlPlugin`)는 enrichment 단계라
 * 이 플러그인보다 먼저 돈다 — 여기 도착한 값은 이미 정제된 값이다.
 */

/**
 * GA 유저 속성으로 넘길 Amplitude 유저 속성 — 푸시 세그먼트 조건이 될 만한 것만. 키를 늘리면 GA 관리 →
 * 맞춤 정의에도 등록해야 FCM 콘솔의 "사용자 속성" 조건에 뜬다.
 */
export const FIREBASE_USER_PROPERTY_KEYS: readonly string[] = [
  "acquisition_channel",
  "camera_permission_granted",
  "has_dday",
  "dday_days_left",
];

const AMPLITUDE_INTERNAL_EVENTS = new Set(["session_start", "session_end"]);
const IDENTIFY_EVENT = "$identify";

function toParamValue(value: unknown): AnalyticsEventParamValue | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return ANALYTICS_PARAM_VALUE_PATTERN.test(value) ? value : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

function toParams(bag: unknown): Record<string, AnalyticsEventParamValue> | undefined {
  if (typeof bag !== "object" || bag === null) return undefined;
  const params: Record<string, AnalyticsEventParamValue> = {};
  for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
    if (Object.keys(params).length >= ANALYTICS_EVENT_MAX_PARAMS) break;
    const value = toParamValue(raw);
    if (ANALYTICS_NAME_PATTERN.test(key) && value !== null) params[key] = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function toUserPropertyValue(raw: unknown): string | null {
  const value = toParamValue(raw);
  if (value === null) return null;
  const text = String(value);
  return text.length <= ANALYTICS_USER_PROPERTY_VALUE_MAX_LENGTH ? text : null;
}

function toUserProperties(userProperties: unknown): Record<string, string | null> {
  const properties: Record<string, string | null> = {};
  if (typeof userProperties !== "object" || userProperties === null) return properties;
  const operations = userProperties as Record<string, unknown>;
  // `$set`을 `$setOnce` 뒤에 돌려 같은 키면 최신 값이 이기고, `$unset`은 마지막이라 지움이 이긴다.
  for (const operation of ["$setOnce", "$set", "$unset"]) {
    const bag = operations[operation];
    if (typeof bag !== "object" || bag === null) continue;
    for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
      if (!FIREBASE_USER_PROPERTY_KEYS.includes(key)) continue;
      if (operation === "$unset") {
        properties[key] = null;
        continue;
      }
      const value = toUserPropertyValue(raw);
      if (value !== null) properties[key] = value;
    }
  }
  return properties;
}

/** Amplitude 이벤트 하나 → 브리지 메시지. Firebase로 보낼 것이 없으면 null. */
export function toFirebaseAnalyticsMessage(
  event: Types.Event,
  atMs: number,
): AnalyticsEventMessage | AnalyticsUserPropertiesMessage | null {
  if (event.event_type === IDENTIFY_EVENT) {
    const properties = toUserProperties(event.user_properties);
    return Object.keys(properties).length > 0
      ? { type: "analytics-user-properties", properties, atMs }
      : null;
  }
  if (
    !ANALYTICS_NAME_PATTERN.test(event.event_type) ||
    AMPLITUDE_INTERNAL_EVENTS.has(event.event_type)
  ) {
    return null;
  }
  const params = toParams(event.event_properties);
  return {
    type: "analytics-event",
    name: event.event_type,
    ...(params !== undefined ? { params } : {}),
    atMs,
  };
}

/** `initAmplitude`가 `init()` 전에 `add()`로 등록한다. */
export function firebaseAnalyticsForwardPlugin(): Types.DestinationPlugin {
  return {
    name: "focusmakers-firebase-analytics-forward",
    type: "destination",
    execute: async (event) => {
      const message = toFirebaseAnalyticsMessage(event, event.time ?? Date.now());
      if (message !== null) postToNative(message);
      return { event, code: 200, message: "" };
    },
  };
}
