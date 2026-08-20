import type { NoticeResponse } from "@focusmakers/types";

import { API_BASE_URL, parseErrorMessage } from "@/lib/api";

export type { NoticeResponse };

/**
 * U1 공지 팝업의 **노출 게이트** (스펙: 2026-08-15-u2-notice-popup-design.md §4.2, BY-377.
 * U 번호 재지정: 공지 팝업이 U1이다 — 과거 U1 업데이트 안내 시트는 2026-08-16 삭제됐다).
 *
 * 화면 컴포넌트(`NoticePopup`)는 순수 프레젠테이션으로 남기고, "이번 방문에 어떤 공지를
 * 띄울 것인가"의 판정을 전부 여기 모은다.
 *
 * 정책(전부 사용자 승인 — 스펙 §2):
 * - 한 방문에 1개만(최신) 표시. 나머지는 다음 방문에서 (결정 3)
 * - X·확인은 이번 방문만 닫음 — 저장하지 않는다. "다시 보지 않기"만 영구 dismiss (결정 4)
 * - dismiss 키는 `focuson.noticeDismissed.{id}` 개별 키 — `focuson.*` 키 관례 (결정 5)
 * - 조회·저장 실패는 `console.warn`만, Sentry `reportHandled` 미사용 (결정 6)
 *
 * 게이트 전체가 fail-closed다: 확신할 수 없으면 띄우지 않는다. 영구 dismiss 여부를 못 읽는데
 * 띄우면 "다시 보지 않기" 약속을 어기게 된다 — 안 띄우는 쪽의 최악은 다음 방문 재노출이다.
 */

/** 활성 공지 목록 조회. 서버가 `starts_at DESC`(최신순)로 정렬해 준다 — 클라이언트는 재정렬하지 않는다. */
export async function fetchActiveNotices(): Promise<NoticeResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/notices/active`, { method: "GET" });
  if (!res.ok) {
    throw await parseErrorMessage(res, "공지 조회 실패");
  }
  return (await res.json()) as NoticeResponse[];
}

const dismissKey = (id: number) => `focuson.noticeDismissed.${id}`;
const DISMISSED_VALUE = "1";

/** "다시 보지 않기"의 영속 저장 — 온보딩 가이드 스토어와 같은 주입형 어댑터 관례. */
export interface NoticeDismissStore {
  isDismissed(id: number): Promise<boolean>;
  /** "다시 보지 않기"를 눌렀을 때 호출 — 멱등. */
  markDismissed(id: number): Promise<void>;
}

export const localStorageNoticeDismissStore: NoticeDismissStore = {
  isDismissed(id) {
    // localStorage 접근은 throw할 수 있다(프라이버시 모드 등) — 게이트의 catch가 fail-closed로 받는다.
    return Promise.resolve(localStorage.getItem(dismissKey(id)) === DISMISSED_VALUE);
  },
  markDismissed(id) {
    localStorage.setItem(dismissKey(id), DISMISSED_VALUE);
    return Promise.resolve();
  },
};

/** 테스트용 인메모리 구현. 영속되지 않으므로 실제 앱에서는 쓰지 않는다. */
export function createMemoryNoticeDismissStore(dismissedIds: number[] = []): NoticeDismissStore {
  const dismissed = new Set(dismissedIds);
  return {
    isDismissed: (id) => Promise.resolve(dismissed.has(id)),
    markDismissed: (id) => {
      dismissed.add(id);
      return Promise.resolve();
    },
  };
}

let store: NoticeDismissStore = localStorageNoticeDismissStore;

/** 저장소 구현체를 교체한다(테스트용). */
export function setNoticeDismissStore(next: NoticeDismissStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(localStorage) 구현으로 되돌린다. */
export function resetNoticeDismissStore(): void {
  store = localStorageNoticeDismissStore;
}

/**
 * 이번 방문에 띄울 공지를 고른다: **활성 공지 중 dismiss 안 된 것 중 최신 1개**, 없으면 null.
 *
 * 절대 reject하지 않는다: 저장소 조회가 실패하면 fail-closed로 null이다.
 */
export async function selectNoticeToShow(
  notices: NoticeResponse[],
): Promise<NoticeResponse | null> {
  try {
    for (const candidate of notices) {
      if (!(await store.isDismissed(candidate.id))) {
        return candidate;
      }
    }
    return null;
  } catch (error) {
    console.warn("[notice] dismiss 여부 조회 실패 — 노출하지 않는다", error);
    return null;
  }
}

/**
 * "다시 보지 않기"를 기록한다 — 해당 공지는 이후 방문에서 다시 뜨지 않는다.
 *
 * 저장에 실패해도 reject하지 않는다. 팝업은 이미 닫힌 뒤이고, 최악의 경우가 "다음 방문에서
 * 한 번 더 뜬다"에 그친다 — 홈 화면 동작을 막을 이유가 없다.
 */
export async function markNoticeDismissed(id: number): Promise<void> {
  try {
    await store.markDismissed(id);
  } catch (error) {
    console.warn("[notice] 다시 보지 않기 저장 실패 — 다음 방문에서 다시 뜰 수 있다", error);
  }
}
