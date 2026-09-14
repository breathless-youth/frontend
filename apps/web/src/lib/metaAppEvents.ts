import type { MetaAppEventMessage } from "@focusmakers/types";

import type { StudyRoomType } from "./amplitude";
import { postToNative } from "./bridge";

/**
 * Meta 광고 전환 이벤트(BY-644) — 브리지 `meta-app-event`로 네이티브 Meta SDK에 넘긴다.
 *
 * 앱 설치 광고의 성과는 설치 그 자체보다 "설치 뒤 실제로 공부했는가"로 판단한다. 그 전환은 전부 웹 화면에서
 * 일어나고 SDK는 앱에 있으므로, 웹이 판정해 네이티브로 보낸다(`track-event`의 역방향). **전환 목록은 이
 * 파일이 소유한다** — 네이티브는 이름을 해석하지 않고 형식만 검증하므로 여기만 고치면 웹 배포로 끝난다.
 *
 * Amplitude 이벤트(`lib/amplitude.ts`)와 같은 자리에서 같은 값으로 부르되 **의도적으로 부분집합**이다 —
 * Meta는 광고 최적화에 쓸 소수의 전환만 원하고, 여기 실린 것은 전부 Meta 서버로 나간다(개인정보처리방침
 * 위탁 항목). 파라미터는 enum·수만, boolean은 1/0으로 접는다(Meta 계약이 문자열·수만 받는다).
 *
 * 브라우저 단독 모드와 Meta env 없는 앱 빌드(개발)에서는 `postToNative`가 조용히 버려지거나 네이티브가
 * no-op으로 받는다 — 여기서 분기하지 않는다.
 */

/** Meta 표준 이벤트 "튜토리얼 완료". `fb_success`는 Meta 표준 파라미터(1=성공). */
export const META_TUTORIAL_COMPLETION_EVENT = "fb_mobile_tutorial_completion";

function postMetaAppEvent(name: string, params?: MetaAppEventMessage["params"]): void {
  postToNative({
    type: "meta-app-event",
    name,
    ...(params !== undefined ? { params } : {}),
    atMs: Date.now(),
  });
}

/** 온보딩 가이드(G1~G5)를 끝까지 완료 — 건너뛰기는 세지 않는다(`OnboardingGuideFlow`의 `completed`만). */
export function trackMetaTutorialCompleted(): void {
  postMetaAppEvent(META_TUTORIAL_COMPLETION_EVENT, { fb_success: 1 });
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
