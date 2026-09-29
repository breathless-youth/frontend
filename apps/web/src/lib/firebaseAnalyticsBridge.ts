import type { Types } from "@amplitude/analytics-browser";

import type {
  AnalyticsEventMessage,
  AnalyticsEventParamValue,
  AnalyticsUserPropertiesMessage,
} from "@focusmakers/types";

import { postToNative } from "./bridge";

/**
 * Amplitude 전송 파이프라인의 끝(destination 플러그인)에서 같은 이벤트를 네이티브 Firebase Analytics(GA4)에도
 * 보낸다 — FCM 콘솔의 오디언스·유저 속성 타겟팅은 Firebase Analytics 데이터만 보기 때문이다.
 *
 * `meta-app-event`(`metaAppEvents.ts`)가 전환 소수를 손으로 고르는 것과 달리 여기는 **Amplitude 카탈로그
 * 전체가 그대로 흐른다** — 세그먼트에 어떤 이벤트가 필요할지 미리 알 수 없고, 목록을 따로 두면 두 카탈로그가
 * 갈라진다. 대신 Firebase 형식에 맞는 것만 남긴다.
 *
 * - 이벤트명·파라미터 키: 영문자로 시작, 영숫자·`_`, 40자 이내 → `[Amplitude] …` autocapture 이벤트는 자연히 빠진다.
 * - 값: 문자열(100자 이내)·유한수. boolean은 "true"/"false"로 접는다(Firebase는 문자열·수만 받는다).
 *   객체·배열·null은 뺀다. 파라미터는 25개까지.
 * - Amplitude 자체 세션 이벤트는 보내지 않는다 — Firebase는 세션을 따로 세고 `session_start`는 예약이라 SDK가 거부한다.
 * - `$identify`는 `$set`·`$setOnce`를 유저 속성으로 옮긴다(키 24자·값 36자 이내). 오디언스 조건에 쓰는 값이다.
 *
 * 브라우저 단독 모드에서는 `postToNative`가 조용히 버린다. URL 정제(`sanitizeUrlPlugin`)는 enrichment 단계라
 * 이 플러그인보다 먼저 돈다 — 여기 도착한 값은 이미 정제된 값이다.
 */

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const USER_PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const MAX_PARAMS = 25;
const PARAM_VALUE_MAX_LENGTH = 100;
const USER_PROPERTY_VALUE_MAX_LENGTH = 36;
const AMPLITUDE_INTERNAL_EVENTS = new Set(["session_start", "session_end"]);
const IDENTIFY_EVENT = "$identify";

function toParamValue(value: unknown): AnalyticsEventParamValue | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    return value.length > 0 && value.length <= PARAM_VALUE_MAX_LENGTH ? value : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

function toParams(bag: unknown): Record<string, AnalyticsEventParamValue> | undefined {
  if (typeof bag !== "object" || bag === null) return undefined;
  const params: Record<string, AnalyticsEventParamValue> = {};
  for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
    if (Object.keys(params).length >= MAX_PARAMS) break;
    const value = toParamValue(raw);
    if (NAME_PATTERN.test(key) && value !== null) params[key] = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function toUserProperties(userProperties: unknown): Record<string, string> {
  const properties: Record<string, string> = {};
  if (typeof userProperties !== "object" || userProperties === null) return properties;
  const operations = userProperties as Record<string, unknown>;
  // `$set`을 나중에 돌려 같은 키면 최신 값이 이긴다.
  for (const operation of ["$setOnce", "$set"]) {
    const bag = operations[operation];
    if (typeof bag !== "object" || bag === null) continue;
    for (const [key, raw] of Object.entries(bag as Record<string, unknown>)) {
      const value = toParamValue(raw);
      if (value === null || !USER_PROPERTY_NAME_PATTERN.test(key)) continue;
      const text = String(value);
      if (text.length <= USER_PROPERTY_VALUE_MAX_LENGTH) properties[key] = text;
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
  if (!NAME_PATTERN.test(event.event_type) || AMPLITUDE_INTERNAL_EVENTS.has(event.event_type)) {
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
