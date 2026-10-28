import type {
  AnalyticsEventMessage,
  AnalyticsEventParamValue,
  AnalyticsUserPropertiesMessage,
  ControlFrame,
  GlassChromeTop,
  InlineControl,
  MetaAppEventMessage,
  MetaAppEventParamValue,
  NativeButtonTone,
  SetGlassChromeMessage,
  SetInlineControlsMessage,
  ToNativeMessage,
  ToWebMessage,
} from "@focusmakers/types";
import {
  ANALYTICS_EVENT_MAX_PARAMS,
  ANALYTICS_NAME_PATTERN,
  ANALYTICS_PARAM_VALUE_PATTERN,
  ANALYTICS_USER_PROPERTY_NAME_PATTERN,
  ANALYTICS_USER_PROPERTY_VALUE_MAX_LENGTH,
  GLASS_CHROME_LEADING,
  NATIVE_BUTTON_TONES,
  NATIVE_CONTROL_COORDINATE_MAX,
  NATIVE_CONTROL_ICON_SIZE_MAX,
  NATIVE_CONTROL_ID_PATTERN,
  NATIVE_CONTROL_IMAGE_PATTERN,
  NATIVE_CONTROL_LABEL_MAX_LENGTH,
  NATIVE_CONTROL_MAX_COUNT,
  NATIVE_CONTROL_POSITION_MIN,
  NATIVE_CONTROL_SYSTEM_IMAGE_PATTERN,
  NATIVE_SEGMENT_MAX_OPTIONS,
  NATIVE_SEGMENT_MIN_OPTIONS,
  NAVIGATE_TAB_SOURCES,
  NAVIGATE_TAB_TARGETS,
  VIDEO_SHARE_TARGETS,
} from "@focusmakers/types";

import { isReservedAnalyticsName } from "./firebaseAnalytics";
import { META_EVENT_MAX_PARAMS, META_EVENT_NAME_PATTERN } from "./metaAds";
import { isInviteCode } from "./sessionInvite";

/**
 * 웹이 설치하는 전역 수신 함수 이름 — 웹 쪽 `NATIVE_MESSAGE_ENTRY`와 **같은 값이어야 한다.**
 * 한쪽만 바꾸면 메시지가 조용히 사라진다(예외도 나지 않는다).
 */
const NATIVE_MESSAGE_ENTRY = "__focusonNativeMessage";

/** `unknown` 값이 계약 목록 안의 리터럴인지 좁힌다. */
function isOneOf<const T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/**
 * 영상 id 형식
 *
 * id가 캐시 파일 이름에 그대로 들어가므로 웹이 `crypto.randomUUID()`로 만든 모양만 받는다.
 * 경로 문자가 섞인 값이 캐시 밖 파일을 가리키지 못하게 막는다.
 */
const VIDEO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

/** 조각 순번과 조각 수. 0 이상의 정수만 받는다. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * WebView 브리지의 네이티브 쪽 끝(세션 상태 모델 스펙 §10).
 *
 * 웹 쪽(`apps/web/src/lib/bridge.ts`)과 **대칭**이다 —
 * 한쪽 유니온을 고치면 반드시 다른 쪽도 고친다. 알 수 없는 메시지를 `null`로 흘리는 이유도
 * 같다: 웹 번들이 앱보다 앞설 수 있고, 모르는 메시지에 죽으면 세션이 멈춘다.
 */
export function parseToNativeMessage(raw: string): ToNativeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.atMs !== "number") {
    return null;
  }
  switch (record.type) {
    case "home-ready":
      return { type: "home-ready", atMs: record.atMs };
    case "analytics-ready":
      return { type: "analytics-ready", atMs: record.atMs };
    case "report-screen": {
      // path는 우리 SPA의 절대 경로만 허용한다 — 임의 문자열이 재마운트 URL에 섞이면
      // 웹뷰가 외부 주소로 열릴 수 있다. `//host` 꼴(프로토콜 상대 URL)도 막는다.
      if (
        typeof record.path !== "string" ||
        !record.path.startsWith("/") ||
        record.path.startsWith("//") ||
        typeof record.dark !== "boolean"
      ) {
        return null;
      }
      let restoreQuery: Record<string, string> | undefined;
      if (typeof record.restoreQuery === "object" && record.restoreQuery !== null) {
        // 문자열 값만 남긴다 — URL 조립(encodeURIComponent)이 감당할 수 있는 형태로 좁힌다.
        restoreQuery = Object.fromEntries(
          Object.entries(record.restoreQuery as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
      return {
        type: "report-screen",
        path: record.path,
        ...(restoreQuery !== undefined ? { restoreQuery } : {}),
        dark: record.dark,
        atMs: record.atMs,
      };
    }
    case "start-session":
      return { type: "start-session", atMs: record.atMs };
    case "navigate-home":
      // 이어서 열 탭과 초대코드는 선택 필드다.
      // 명세 밖 값이면 그 필드만 빼고 모달 닫기는 살린다(탭이 빠지면 홈 탭에 머문다).
      return {
        type: "navigate-home",
        ...(record.tab === "records" || record.tab === "ranking" ? { tab: record.tab } : {}),
        ...(isInviteCode(record.inviteCode) ? { inviteCode: record.inviteCode } : {}),
        atMs: record.atMs,
      };
    case "records-changed":
      return { type: "records-changed", atMs: record.atMs };
    case "profile-updated":
      // 잘못 지우는 것보다 저장값을 두는 편이 낫고 다음 갱신이 바로잡으므로 모양이 어긋나면 통째로 버린다.
      if (
        (typeof record.goal !== "string" && record.goal !== null) ||
        typeof record.nickname !== "string"
      ) {
        return null;
      }
      return {
        type: "profile-updated",
        goal: record.goal,
        nickname: record.nickname,
        atMs: record.atMs,
      };
    case "open-settings":
      return { type: "open-settings", atMs: record.atMs };
    case "app-lock-query":
    case "app-lock-authorize":
    case "app-lock-pick":
    case "pick-profile-photo":
      if (typeof record.id !== "string" || record.id === "") {
        return null;
      }
      return { type: record.type, id: record.id, atMs: record.atMs };
    case "app-lock-start":
    case "app-lock-stop":
    case "app-lock-battery-guide":
      return { type: record.type, atMs: record.atMs };
    case "request-camera-permission":
      return { type: "request-camera-permission", atMs: record.atMs };
    case "share":
      if (typeof record.text !== "string") {
        return null;
      }
      // url·title은 선택 필드 — 문자열이 아니면 그 필드만 버린다. 현행 웹은 url을 보내지
      // 않고(BY-584, 카톡 프리뷰 중복 방지) 링크를 text에 둔다. url 수신은 레거시 호환용이다.
      // text만 있어도 시트는 열리므로 메시지를 통째로 버리지 않는다.
      return {
        type: "share",
        text: record.text,
        ...(typeof record.url === "string" ? { url: record.url } : {}),
        ...(typeof record.title === "string" ? { title: record.title } : {}),
        atMs: record.atMs,
      };
    case "video-chunk":
      if (!isVideoId(record.id) || !isCount(record.seq) || typeof record.data !== "string") {
        return null;
      }
      return {
        type: "video-chunk",
        id: record.id,
        seq: record.seq,
        data: record.data,
        atMs: record.atMs,
      };
    case "video-save":
      if (!isVideoId(record.id) || !isCount(record.chunks)) {
        return null;
      }
      return { type: "video-save", id: record.id, chunks: record.chunks, atMs: record.atMs };
    case "video-share":
      if (!isVideoId(record.id) || !isCount(record.chunks) || typeof record.text !== "string") {
        return null;
      }
      // 제목과 목적지는 선택 필드라 모르는 값이면 그 필드만 빼고 공유는 살린다.
      return {
        type: "video-share",
        id: record.id,
        chunks: record.chunks,
        text: record.text,
        ...(typeof record.title === "string" ? { title: record.title } : {}),
        ...(isOneOf(VIDEO_SHARE_TARGETS, record.target) ? { target: record.target } : {}),
        atMs: record.atMs,
      };
    case "navigate-tab":
      // 목적지가 계약에 없는 값이면 통째로 버린다 — 모르는 경로로 navigate하면 죽거나
      // 엉뚱한 화면이 뜬다. 유니온이 넓어지면 여기 검사도 함께 넓힌다.
      if (!isOneOf(NAVIGATE_TAB_TARGETS, record.tab)) {
        return null;
      }
      // 발신처는 선택 필드 — 계약 밖 값이면 빼고(= `card` 기본) 메시지 자체는 살린다. 이동이
      // 분석 속성 하나 때문에 막히면 안 된다.
      return {
        type: "navigate-tab",
        tab: record.tab,
        ...(isOneOf(NAVIGATE_TAB_SOURCES, record.via) ? { via: record.via } : {}),
        atMs: record.atMs,
      };
    case "set-tab-bar":
      // `visible`이 boolean이 아니면 통째로 버린다 — 기본값(보임)이 유지되는 편이 안전하다.
      // 여기서 truthy 판정으로 넘기면 오타 하나에 탭 바가 사라져 이동 수단이 없어진다.
      if (typeof record.visible !== "boolean") {
        return null;
      }
      return {
        type: "set-tab-bar",
        visible: record.visible,
        // 값이 이상해도 메시지를 통째로 버리지 않는다. 버리면 탭 바 신호 자체가 사라져
        // 지금보다 나빠진다(`share`의 url과 같은 처리).
        ...(record.blockedByModal === true ? { blockedByModal: true } : {}),
        atMs: record.atMs,
      };
    case "set-back-gesture":
      // `enabled`가 boolean이 아니면 통째로 버린다 — 기본값(켜짐)이 유지되는 편이 안전하다.
      // 여기서 truthy 판정으로 넘기면 오타 하나에 문의하기 스와이프 복귀가 사라진다.
      if (typeof record.enabled !== "boolean") {
        return null;
      }
      return { type: "set-back-gesture", enabled: record.enabled, atMs: record.atMs };
    case "set-back-lock":
      // `locked`가 boolean이 아니면 통째로 버린다 — 기본값(풀림)이 유지되는 편이 안전하다.
      // truthy 판정으로 넘기면 오타 하나에 뒤로가기가 영구적으로 잠긴다.
      if (typeof record.locked !== "boolean") {
        return null;
      }
      return { type: "set-back-lock", locked: record.locked, atMs: record.atMs };
    case "set-orientation":
      // `unlocked`가 boolean이 아니면 통째로 버린다 — 기본값(세로 잠금)이 유지되는 편이 안전하다.
      if (typeof record.unlocked !== "boolean") {
        return null;
      }
      return { type: "set-orientation", unlocked: record.unlocked, atMs: record.atMs };
    case "request-camera-gate":
      return { type: "request-camera-gate", atMs: record.atMs };
    case "auth-ready":
      return { type: "auth-ready", atMs: record.atMs };
    case "request-token-refresh":
      return { type: "request-token-refresh", atMs: record.atMs };
    case "haptic":
      if (
        record.style !== "light" &&
        record.style !== "medium" &&
        record.style !== "heavy" &&
        record.style !== "alert"
      ) {
        return null;
      }
      return { type: "haptic", style: record.style, atMs: record.atMs };
    case "motion-sensor":
      // `enabled`가 boolean이 아니면 통째로 버린다 — 애매한 값으로 센서 구독을 잘못
      // 켜고 끄는 것보다 기존 상태를 유지하는 편이 안전하다.
      if (typeof record.enabled !== "boolean") {
        return null;
      }
      return { type: "motion-sensor", enabled: record.enabled, atMs: record.atMs };
    case "meta-app-event":
      return parseMetaAppEvent(record);
    case "analytics-event":
      return parseAnalyticsEvent(record);
    case "analytics-user-properties":
      return parseAnalyticsUserProperties(record);
    case "set-glass-chrome":
      return parseSetGlassChrome(record);
    case "set-inline-controls":
      return parseSetInlineControls(record);
    default:
      return null;
  }
}

/** 파라미터 객체에서 형식에 맞는 키·값만 `max`개까지 남긴다. 객체가 아니면 null. */
function pickParams<V>(
  bag: unknown,
  keyPattern: RegExp,
  isValue: (value: unknown) => value is V,
  max: number,
): Record<string, V> | null {
  if (typeof bag !== "object" || bag === null) {
    return null;
  }
  const params: Record<string, V> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (Object.keys(params).length >= max) {
      break;
    }
    if (keyPattern.test(key) && isValue(value)) {
      params[key] = value;
    }
  }
  return params;
}

/**
 * 문자열 파라미터 값은 열거형 토큰만 받는다 — `room_type: "social"`, `method: "copied"` 같은 것.
 * 계약(`MetaAppEventMessage` 주석)은 식별자·초대코드·자유 문자열 금지를 말로만 적어 뒀고, 그 규칙을
 * 웹 쪽 관례로만 지키면 실수 한 번에 사용자 입력이 Meta 서버로 나간다. 닉네임·목표 문구 같은 자유
 * 문자열은 공백·문장부호·한글을 달고 오므로 여기서 걸린다.
 *
 * ponytail: 짧은 ASCII 토큰이면 통과하므로 초대코드처럼 토큰꼴 식별자는 못 막는다. 키 화이트리스트를
 * 두면 확실하지만 "전환 목록은 웹이 소유한다"는 설계를 깨므로, 그 교환이 필요해지면 그때 옮긴다.
 */
const META_PARAM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function isMetaParamValue(value: unknown): value is MetaAppEventParamValue {
  if (typeof value === "string") {
    return META_PARAM_TOKEN_PATTERN.test(value);
  }
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `meta-app-event`(웹 → Meta SDK 전환 이벤트)를 검증한다 — 이름이 Meta 형식에 어긋나면 통째로
 * 버리고, 파라미터는 형식에 맞는 키·문자열/유한수 값만 25개까지 남긴다. 이름은 화이트리스트하지 않는다 —
 * 전환 목록은 웹(`apps/web/src/lib/metaAppEvents.ts`)이 소유하고, 여기서 막으면 웹 배포만으로 전환을
 * 바꿀 수 없게 된다. 형식 밖 값을 SDK에 그대로 넘기면 네이티브 예외로 이벤트가 통째로 사라진다.
 */
function parseMetaAppEvent(record: Record<string, unknown>): MetaAppEventMessage | null {
  if (
    typeof record.name !== "string" ||
    !META_EVENT_NAME_PATTERN.test(record.name) ||
    typeof record.atMs !== "number"
  ) {
    return null;
  }
  let params: Record<string, MetaAppEventParamValue> | undefined;
  if (record.params !== undefined) {
    const picked = pickParams(
      record.params,
      META_EVENT_NAME_PATTERN,
      isMetaParamValue,
      META_EVENT_MAX_PARAMS,
    );
    if (picked === null) {
      return null;
    }
    params = picked;
  }
  const valueToSum =
    typeof record.valueToSum === "number" && Number.isFinite(record.valueToSum)
      ? record.valueToSum
      : undefined;
  return {
    type: "meta-app-event",
    name: record.name,
    ...(params !== undefined ? { params } : {}),
    ...(valueToSum !== undefined ? { valueToSum } : {}),
    atMs: record.atMs,
  };
}

/**
 * 문자열은 토큰만(`ANALYTICS_PARAM_VALUE_PATTERN`), 수는 유한수만. boolean은 웹이 이미 문자열로 접었다.
 * 웹(`firebaseAnalyticsBridge.ts`)이 같은 규칙으로 걸러 보내지만, 웹 번들이 앱보다 앞설 수 있어 여기서도
 * 거른다 — Meta 경로(`isMetaParamValue`)와 같은 이유로 자유 문자열이 Google 서버로 나가면 안 된다.
 */
function isAnalyticsParamValue(value: unknown): value is AnalyticsEventParamValue {
  if (typeof value === "string") {
    return ANALYTICS_PARAM_VALUE_PATTERN.test(value);
  }
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `analytics-event`(웹 → Firebase Analytics)를 검증한다 — 이름이 Firebase 형식에 어긋나거나 예약 접두사면
 * 통째로 버리고, 파라미터는 형식에 맞는 키·값만 25개까지 남긴다. 이름은 화이트리스트하지 않는다 —
 * 이벤트 목록은 웹 Amplitude 카탈로그가 소유한다(`meta-app-event`와 같은 이유). 형식 밖 값을 SDK에 넘기면
 * 네이티브 예외로 이벤트가 통째로 사라진다.
 */
function parseAnalyticsEvent(record: Record<string, unknown>): AnalyticsEventMessage | null {
  if (
    typeof record.name !== "string" ||
    !ANALYTICS_NAME_PATTERN.test(record.name) ||
    isReservedAnalyticsName(record.name) ||
    typeof record.atMs !== "number"
  ) {
    return null;
  }
  let params: Record<string, AnalyticsEventParamValue> | undefined;
  if (record.params !== undefined) {
    const picked = pickParams(
      record.params,
      ANALYTICS_NAME_PATTERN,
      isAnalyticsParamValue,
      ANALYTICS_EVENT_MAX_PARAMS,
    );
    if (picked === null) {
      return null;
    }
    params = picked;
  }
  return {
    type: "analytics-event",
    name: record.name,
    ...(params !== undefined ? { params } : {}),
    atMs: record.atMs,
  };
}

/** `null`은 속성을 지우라는 뜻(Firebase 계약). 문자열은 36자 이내 토큰만. */
function isAnalyticsUserPropertyValue(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  return (
    typeof value === "string" &&
    value.length <= ANALYTICS_USER_PROPERTY_VALUE_MAX_LENGTH &&
    ANALYTICS_PARAM_VALUE_PATTERN.test(value)
  );
}

/**
 * `analytics-user-properties`(웹 → Firebase 유저 속성)를 검증한다 — 키 24자·값 36자 이내 토큰(또는 지움을 뜻하는
 * `null`)만 남기고, 남는 항목이 없으면 통째로 버린다(빈 갱신은 SDK 호출만 낭비한다). 키 화이트리스트는 웹이
 * 소유한다(`FIREBASE_USER_PROPERTY_KEYS`) — 여기서 또 두면 웹 배포만으로 속성을 늘릴 수 없다.
 */
function parseAnalyticsUserProperties(
  record: Record<string, unknown>,
): AnalyticsUserPropertiesMessage | null {
  if (typeof record.atMs !== "number") {
    return null;
  }
  const properties = pickParams(
    record.properties,
    ANALYTICS_USER_PROPERTY_NAME_PATTERN,
    isAnalyticsUserPropertyValue,
    ANALYTICS_EVENT_MAX_PARAMS,
  );
  if (properties === null || Object.keys(properties).length === 0) {
    return null;
  }
  return { type: "analytics-user-properties", properties, atMs: record.atMs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** 새로 생긴 선택 필드는 그 필드를 모르는 웹 번들이 보내지 않아서 빠진 값은 받는다. */
function isOptional<T>(
  value: unknown,
  check: (value: unknown) => value is T,
): value is T | undefined {
  return value === undefined || check(value);
}

function isButtonTone(value: unknown): value is NativeButtonTone {
  return isOneOf(NATIVE_BUTTON_TONES, value);
}

function isIconSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= NATIVE_CONTROL_ICON_SIZE_MAX
  );
}

function isDarkScheme(value: unknown): value is "dark" {
  return value === "dark";
}

function isControlId(value: unknown): value is string {
  return typeof value === "string" && NATIVE_CONTROL_ID_PATTERN.test(value);
}

/** 네이티브 부품에 그릴 글자. 빈 글자는 내용 없는 버튼이 되고 긴 글자는 고정 폭 자리를 깨뜨린다. */
function isLabel(value: unknown): value is string {
  return (
    typeof value === "string" && value !== "" && value.length <= NATIVE_CONTROL_LABEL_MAX_LENGTH
  );
}

function isNullableLabel(value: unknown): value is string | null {
  return value === null || isLabel(value);
}

function isSystemImage(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && NATIVE_CONTROL_SYSTEM_IMAGE_PATTERN.test(value))
  );
}

function isBundledImage(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && NATIVE_CONTROL_IMAGE_PATTERN.test(value));
}

function isCoordinate(value: unknown, min: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= NATIVE_CONTROL_COORDINATE_MAX
  );
}

function parseFrame(value: unknown): ControlFrame | null {
  if (
    !isRecord(value) ||
    !isCoordinate(value.x, NATIVE_CONTROL_POSITION_MIN) ||
    !isCoordinate(value.y, NATIVE_CONTROL_POSITION_MIN) ||
    !isCoordinate(value.width, 0) ||
    !isCoordinate(value.height, 0)
  ) {
    return null;
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

/** 항목 하나라도 틀리면 배열 전체를 버린다. */
function parseEach<T>(items: unknown[], parse: (item: unknown) => T | null): T[] | null {
  const parsed = items.map(parse);
  return parsed.every((item): item is T => item !== null) ? parsed : null;
}

function parseGlassChromeTop(value: unknown): GlassChromeTop | null {
  if (
    !isRecord(value) ||
    !isOneOf(GLASS_CHROME_LEADING, value.leading) ||
    !isLabel(value.leadingLabel) ||
    !isNullableLabel(value.title)
  ) {
    return null;
  }
  return { leading: value.leading, leadingLabel: value.leadingLabel, title: value.title };
}

/**
 * `set-glass-chrome`(웹 → 네이티브 고정 요소)을 검증한다
 *
 * 어느 필드든 틀리면 기본값으로 메우지 않고 메시지 전체를 버린다.
 * 직전 모양이 남는 편이 엉뚱한 버튼이 뜨는 것보다 낫다.
 * boolean을 truthy로 읽으면 `"false"` 하나에 화면을 가리는 층이 숨겨지거나 버튼이 눌리지 않는다.
 */
function parseSetGlassChrome(record: Record<string, unknown>): SetGlassChromeMessage | null {
  if (!isBoolean(record.obscured) || typeof record.atMs !== "number") {
    return null;
  }
  const top = record.top === null ? null : parseGlassChromeTop(record.top);
  if (record.top !== null && top === null) {
    return null;
  }
  return { type: "set-glass-chrome", top, obscured: record.obscured, atMs: record.atMs };
}

/**
 * 본문 부품 하나 검증
 *
 * 이 앱보다 새 웹이 보낸 모르는 종류는 틀린 부품과 구분해 `"unknown"`으로 돌려준다.
 */
function parseInlineControl(value: unknown): InlineControl | "unknown" | null {
  if (!isRecord(value) || !isControlId(value.id) || !isOptional(value.faded, isBoolean)) {
    return null;
  }
  const frame = parseFrame(value.frame);
  if (frame === null) {
    return null;
  }
  const { id, faded } = value;
  switch (value.kind) {
    case "segment": {
      const { labels, selected, disabled, accessibilityLabel } = value;
      if (
        !Array.isArray(labels) ||
        labels.length < NATIVE_SEGMENT_MIN_OPTIONS ||
        labels.length > NATIVE_SEGMENT_MAX_OPTIONS ||
        !labels.every(isLabel) ||
        !Array.isArray(disabled) ||
        disabled.length !== labels.length ||
        !disabled.every(isBoolean) ||
        // -1은 아무것도 고르지 않은 상태다.
        typeof selected !== "number" ||
        !Number.isInteger(selected) ||
        selected < -1 ||
        selected >= labels.length ||
        !isNullableLabel(accessibilityLabel)
      ) {
        return null;
      }
      return { id, kind: "segment", frame, labels, selected, disabled, accessibilityLabel, faded };
    }
    case "switch": {
      const { on, disabled, interactive, accessibilityLabel } = value;
      if (
        !isBoolean(on) ||
        !isBoolean(disabled) ||
        !isBoolean(interactive) ||
        !isLabel(accessibilityLabel)
      ) {
        return null;
      }
      return { id, kind: "switch", frame, on, disabled, interactive, accessibilityLabel, faded };
    }
    case "button": {
      const { title, systemImage, shape, accessibilityLabel, tone, iconSize, turns } = value;
      // disabled와 image가 생기기 전 웹 번들은 두 필드를 보내지 않아서 빠지면 누를 수 있고 이미지 없는 버튼으로 읽는다.
      const disabled = value.disabled === undefined ? false : value.disabled;
      const image = value.image === undefined ? null : value.image;
      if (
        !isNullableLabel(title) ||
        !isSystemImage(systemImage) ||
        !isBundledImage(image) ||
        (shape !== "capsule" && shape !== "circle") ||
        !isBoolean(disabled) ||
        !isLabel(accessibilityLabel) ||
        !isOptional(tone, isButtonTone) ||
        !isOptional(iconSize, isIconSize) ||
        !isOptional(turns, isCount)
      ) {
        return null;
      }
      return {
        id,
        kind: "button",
        frame,
        title,
        systemImage,
        image,
        shape,
        disabled,
        accessibilityLabel,
        tone,
        iconSize,
        turns,
        faded,
      };
    }
    default:
      return typeof value.kind === "string" ? "unknown" : null;
  }
}

/**
 * `set-inline-controls`(웹 → 네이티브 본문 부품)를 검증한다
 *
 * 부품 하나만 틀려도 메시지 전체를 버린다.
 * 앱은 목록에 없는 부품을 삭제하므로 일부만 반영하면 버린 부품의 이전 네이티브 뷰가 낡은 상태로 남는다.
 * 모르는 종류의 부품은 앱이 그린 적이 없어 낡을 뷰가 없으므로 그 부품만 빼고 나머지를 그린다.
 * 웹 쪽 실수로 등록이 끝없이 늘어도 네이티브 뷰를 그만큼 만들지 않게 개수 상한에서 막는다.
 */
function parseSetInlineControls(record: Record<string, unknown>): SetInlineControlsMessage | null {
  if (
    !Array.isArray(record.controls) ||
    record.controls.length > NATIVE_CONTROL_MAX_COUNT ||
    !isBoolean(record.hidden) ||
    !isOptional(record.colorScheme, isDarkScheme) ||
    typeof record.atMs !== "number"
  ) {
    return null;
  }
  const parsed = parseEach(record.controls, parseInlineControl);
  if (parsed === null) {
    return null;
  }
  const controls = parsed.filter((control) => control !== "unknown");
  return {
    type: "set-inline-controls",
    controls,
    hidden: record.hidden,
    colorScheme: record.colorScheme,
    atMs: record.atMs,
  };
}

/** WebView `injectJavaScript`로 밀어 넣을 때 쓸 직렬화. */
export function serializeToWebMessage(message: ToWebMessage): string {
  return JSON.stringify(message);
}

/**
 * 네이티브 → 웹 메시지를 `injectJavaScript`에 넣을 스크립트로 만든다.
 *
 * 웹이 설치한 전역 함수를 호출한다 — 이름은 양쪽이 공유하는 계약이고 웹 쪽
 * (`apps/web/src/lib/bridge.ts`)의 `NATIVE_MESSAGE_ENTRY`와 같아야 한다.
 * `window.postMessage`를 쓰지 않는 이유는 그쪽 주석에 있다(플랫폼마다 메시지가
 * `window`/`document`로 갈려 한쪽에서 조용히 도착하지 않는다).
 *
 * 세부 두 가지가 중요하다.
 *
 * - **`JSON.stringify`를 한 번 더 건다.** 직렬화된 JSON을 JS 소스에 그대로 이어 붙이면 안의
 *   따옴표·개행이 스크립트를 깨뜨린다. 한 번 더 감싸면 안전한 문자열 리터럴이 된다.
 * - **전역이 있는지 먼저 본다.** 웹이 아직 로드되지 않았거나 세션 화면이 아니면 전역이 없고,
 *   그때 그냥 호출하면 WebView 안에서 예외가 난다.
 * - **`true;`로 끝낸다.** iOS에서 `injectJavaScript`의 마지막 표현식 값이 그대로 돌아오는데,
 *   객체를 반환하면 직렬화 경고가 난다.
 */
export function injectMessageScript(message: ToWebMessage): string {
  const payload = JSON.stringify(serializeToWebMessage(message));
  return `if (window.${NATIVE_MESSAGE_ENTRY}) { window.${NATIVE_MESSAGE_ENTRY}(${payload}); } true;`;
}
