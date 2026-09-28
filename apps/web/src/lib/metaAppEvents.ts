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
 * 위탁 항목). 파라미터는 enum·수만, boolean은 1/0으로 접는다(Meta 계약이 문자열·수만 받는다).
 *
 * 브라우저 단독 모드와 Meta env 없는 앱 빌드(개발)에서는 `postToNative`가 조용히 버려지거나 네이티브가
 * no-op으로 받는다 — 여기서 분기하지 않는다.
 */

/** Meta 표준 이벤트 "튜토리얼 완료". `fb_success`는 Meta 표준 파라미터(1=성공). */
export const META_TUTORIAL_COMPLETION_EVENT = "fb_mobile_tutorial_completion";

/**
 * 같은 전환을 다시 보내지 않을 시간 창. 웹뷰가 같은 주소를 두 번 읽으면 마운트 1회 이펙트가
 * 두 번 돌아 전환이 겹쳐 나간다(2026-09-29 실기 확인: `/room/1`·`/home` 모두 문서가 두 번 로드됐다).
 * 겹친 전환은 Meta의 광고 최적화가 잘못된 신호로 학습하고 성과 지표도 부풀린다.
 */
const DEDUPE_WINDOW_MS = 10_000;
const DEDUPE_KEY_PREFIX = "meta-app-event:";

/**
 * 창 안에 같은 전환이 이미 나갔는지 본다. 문서가 새로 뜨면 모듈 상태는 사라지므로 메모리로는
 * 못 막는다 — 같은 웹뷰의 문서 교체를 건너뛰는 `sessionStorage`에 둔다.
 *
 * 읽기·쓰기 실패는 통과시킨다(fail-open). 전환 유실이 중복보다 비싸고, 브라우저 단독 모드나
 * 저장소가 막힌 환경에서 계측이 통째로 멎으면 안 된다.
 *
 * ponytail: 이름+파라미터와 시간 창으로만 가른다. 세션 식별자를 키로 쓰는 편이 정확하지만 지금
 * 훅에는 로드를 가로질러 안정적인 식별자가 없다 — 근본 원인(이중 로드)을 고칠 때 같이 정리한다.
 */
function isDuplicate(name: string, params?: MetaAppEventMessage["params"]): boolean {
  const key = `${DEDUPE_KEY_PREFIX}${name}:${JSON.stringify(params ?? null)}`;
  const now = Date.now();
  try {
    const previous = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(previous) && previous > 0 && now - previous < DEDUPE_WINDOW_MS) {
      return true;
    }
    window.sessionStorage.setItem(key, String(now));
  } catch {
    return false;
  }
  return false;
}

function postMetaAppEvent(name: string, params?: MetaAppEventMessage["params"]): void {
  if (isDuplicate(name, params)) {
    return;
  }
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
