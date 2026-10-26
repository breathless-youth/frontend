import type { MetaAppEventMessage } from "@focusmakers/types";

import type { StudyRoomType } from "./amplitude";
import { postToNative } from "./bridge";

/**
 * Meta 광고 전환 이벤트 — 브리지 `meta-app-event`로 네이티브 Meta SDK에 넘긴다.
 *
 * 앱 설치 광고의 성과는 설치 그 자체보다 "설치 뒤 실제로 공부했는가"로 판단한다. 그 전환은 전부 웹 화면에서
 * 일어나고 SDK는 앱에 있으므로, 웹이 판정해 네이티브로 보낸다(`track-event`의 역방향). **전환 목록은 이
 * 파일이 소유한다** — 네이티브는 이름을 해석하지 않고 형식만 검증하므로 여기만 고치면 웹 배포로 끝난다.
 *
 * Amplitude 이벤트(`lib/amplitude.ts`)와 같은 자리에서 같은 값으로 부르되 **의도적으로 부분집합**이다 —
 * Meta는 광고 최적화에 쓸 소수의 전환만 원하고, 여기 실린 것은 전부 Meta 서버로 나간다(개인정보처리방침
 * 9조 행태정보). 파라미터는 enum·수만, boolean은 1/0으로 접는다(Meta 계약이 문자열·수만 받는다).
 * 순공 5분 달성(`trackMetaFocusMilestone`)만 Amplitude에 짝이 없다. 이유는 그 함수 주석에 있다.
 *
 * 브라우저 단독 모드와 Meta env 없는 앱 빌드(개발)에서는 `postToNative`가 조용히 버려지거나 네이티브가
 * no-op으로 받는다 — 여기서 분기하지 않는다.
 */

/** Meta 표준 이벤트 "성취 달성". 순공 5분 달성에만 쓴다. */
export const META_ACHIEVEMENT_UNLOCKED_EVENT = "fb_mobile_achievement_unlocked";

function postMetaAppEvent(name: string, params?: MetaAppEventMessage["params"]): void {
  postToNative({
    type: "meta-app-event",
    name,
    ...(params !== undefined ? { params } : {}),
    atMs: Date.now(),
  });
}

/**
 * 공부 세션 시작 = 스터디룸 진입. 복원 진입(`restored`)은 같은 세션의 두 번째 시작이라 보내지 않는다 —
 * Amplitude와 달리 여기서는 속성으로 가르지 않고 아예 뺀다(Meta 쪽에서 필터할 수단이 약하다).
 */
export function trackMetaStudySessionStarted(roomType: StudyRoomType, restored: boolean): void {
  if (restored) return;
  postMetaAppEvent("study_session_started", { room_type: roomType });
}

/** 공부 세션 종료 집계 — 세션당 한 번(호출부 `useStudyRoomSession`이 보장). 초 단위 정수만 싣는다. */
export function trackMetaStudySessionEnded(input: {
  readonly roomType: StudyRoomType;
  readonly studySec: number;
  readonly focusSec: number;
}): void {
  postMetaAppEvent("study_session_ended", {
    room_type: input.roomType,
    study_sec: Math.round(Number(input.studySec)),
    focus_sec: Math.round(Number(input.focusSec)),
  });
}

/** 소셜룸 실제 입장(세션 마운트) — 유예 재입장은 호출부가 거른다. */
export function trackMetaSocialRoomEntered(): void {
  postMetaAppEvent("social_room_entered");
}

/**
 * 초대 공유 — 친구를 데려오는 추천 행동(S9-2). `method`는 OS 공유 시트(`shared`) / 클립보드 복사(`copied`).
 * 실패는 전환이 아니라 보내지 않는다. 그룹 스터디 확산을 광고 목표로 잡을 때의 전환이다.
 */
export function trackMetaInviteShared(method: "shared" | "copied" | "failed"): void {
  if (method === "failed") return;
  postMetaAppEvent("invite_shared", { method });
}

/** 순공 5분 달성 판정 기준(초). 한 세션의 `focusSec`이 이 값에 닿으면 달성이다. */
export const META_FOCUS_MILESTONE_SEC = 300;

const FOCUS_MILESTONE_SENT_KEY = "focusmakers:meta-focus-5min-sent";

/**
 * 순공 5분 달성, 광고 성과의 핵심 활성화 지표
 *
 * 광고 관리자는 이벤트 단위로 열을 보여줘서 `study_session_ended`의 `focus_sec`을 값으로 걸러 셀 수 없다.
 * 그래서 300초에 닿는 순간 전용 이벤트를 따로 보내고, Amplitude에는 같은 이벤트를 두지 않는다.
 * 맞춤 이벤트는 그 이벤트로 최적화 캠페인을 돌리기 전까지 광고 관리자 열에 안 나올 수 있어 표준 이벤트를 쓴다.
 * 열이 "사람 수"로 읽히도록 기기당 한 번만 보낸다.
 * 저장소를 못 쓰면 표시 없이 보낸다. 핵심 지표를 잃는 것보다 드물게 두 번 세는 편이 낫다.
 */
export function trackMetaFocusMilestone(): void {
  try {
    if (localStorage.getItem(FOCUS_MILESTONE_SENT_KEY) !== null) return;
    localStorage.setItem(FOCUS_MILESTONE_SENT_KEY, "1");
  } catch {
    // 프라이빗 모드 등에서 저장소 접근이 막힌 경우다.
  }
  postMetaAppEvent(META_ACHIEVEMENT_UNLOCKED_EVENT, { fb_description: "focus_5min" });
}
