import { useEffect, useEffectEvent, useRef } from "react";

import {
  pageEntryOnTop,
  useSessionPageHistory,
} from "@/features/study-session/useSessionPageHistory";
import type { PageCloseReason } from "@/features/study-session/useSessionPageHistory";

/**
 * 방 항목 위에 두는 지킴 항목의 키
 *
 * 창 항목 아래에 두어서, 창이 닫힌 뒤 잠금 신호가 앱에 닿기 전의 스와이프가 방 항목에 먼저 닿게 한다.
 */
const GUARD_HISTORY_KEY = "roomHistoryGuard";

// 같은 문서 안 이동이라 금방 오지만, popstate가 끝내 오지 않아도 방을 나가는 길이 막히면 안 된다.
const POP_STATE_TIMEOUT_MS = 1000;

function guardEntryOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && GUARD_HISTORY_KEY in state;
}

// 라우터 상태를 함께 복사해 두어야 이 항목에서도 라우터가 같은 화면으로 본다.
function pushGuardEntry() {
  window.history.pushState({ ...(window.history.state ?? {}), [GUARD_HISTORY_KEY]: true }, "");
}

function nextPopState(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, POP_STATE_TIMEOUT_MS);
    window.addEventListener("popstate", finish);
  });
}

function traverse(delta: number): Promise<void> {
  const arrived = nextPopState();
  window.history.go(delta);
  return arrived;
}

/**
 * 방 항목 위의 항목을 모두 걷고 떠날 자리 만들기
 *
 * 방 항목 위에 둔 채 바꿔 끼우면 그 아래의 방 항목이 남아 뒤로 가기로 끝난 방에 다시 입장한다.
 * 방 항목으로 내려와 바꿔 끼워도 앞쪽에 방 경로의 항목이 남아 앞으로 가기로 다시 입장한다.
 * History API에 앞쪽을 지우는 길은 새 항목을 쌓는 것뿐이어서, 입장과 무관한 홈 경로로 한 번 쌓아 지운 뒤 방 항목으로 되돌아온다.
 * 호출부의 이동은 이 일이 다 끝난 뒤에 불러서 도착한 화면이 움직이는 history를 만나지 않는다.
 */
async function clearEntriesAboveRoom(closeInFlight: boolean, homeUrl: string) {
  // WebKit은 되돌리는 중에 온 되돌리기를 덮어쓰므로 진행 중인 닫기가 끝난 자리에서 다시 센다.
  if (closeInFlight) {
    await nextPopState();
  }
  const above = (pageEntryOnTop() ? 1 : 0) + (guardEntryOnTop() ? 1 : 0);
  if (above > 0) {
    await traverse(-above);
  }
  const { idx } = (window.history.state ?? {}) as { idx?: number };
  window.history.pushState({ idx, key: "default" }, "", homeUrl);
  await traverse(-1);
}

/**
 * 공부방 과목·배경음 창의 history
 *
 * 싱글룸과 같이 창을 history 항목으로 열어 앱의 뒤로 가기 스와이프로 닫는다.
 * 다만 공부방은 뒤로 가기로 방을 나가면 제출하지 않은 측정이 사라진다.
 * 창이 닫힌 뒤 제스처를 끄는 신호가 앱에 닿기까지 틈이 있어서, 그 틈의 스와이프가 방 밖으로 나가지 않게 방 항목 위에 지킴 항목을 둔다.
 * 지킴 항목을 떠나 방 항목에 닿으면 바로 다시 쌓으므로 스와이프를 몇 번 거듭해도 방 항목 아래로 내려가지 않는다.
 * 지킴 항목은 방을 떠날 때까지 남고, 떠날 때는 `leaveThen`이 걷는다.
 *
 * 지킴 항목은 창을 열 때가 아니라 방이 그려진 뒤에 쌓는다.
 * 창을 열 때 항목을 하나만 쌓아야 싱글룸처럼 그 아래 항목의 미리보기가 방 화면으로 남는다.
 * 같은 순간에 둘을 쌓았을 때 실기기 스와이프 미리보기가 흰 화면이었다.
 */
export function useRoomSheetHistory<Page extends string>({
  page,
  setPage,
  studying,
  onClosed,
}: {
  page: Page | null;
  setPage: (next: Page | null) => void;
  studying: boolean;
  onClosed: (closed: Page | null, closedBy: PageCloseReason) => void;
}) {
  // 새로고침으로 지킴 항목 위에서 시작한 방은 이미 항목을 쌓은 방이다.
  const armedRef = useRef(guardEntryOnTop());
  const leavingRef = useRef(false);

  function armGuard() {
    armedRef.current = true;
    if (!guardEntryOnTop()) {
      pushGuardEntry();
    }
  }

  const { openPage, closePage, closeInFlight } = useSessionPageHistory({
    page,
    setPage,
    studying,
    onClosed,
    // 앱이 가려진 채 입장하면 프레임이 돌지 않아 지킴 항목보다 창이 먼저 열릴 수 있다.
    beforePush: armGuard,
  });

  const onFirstPaint = useEffectEvent(() => {
    if (!leavingRef.current) {
      armGuard();
    }
  });
  useEffect(() => {
    // 앞 프레임 콜백은 그리기 전에 돌아서 한 번 더 넘겨야 방이 그려진 뒤다.
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => onFirstPaint());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const onGuardPopState = useEffectEvent(() => {
    if (leavingRef.current || !armedRef.current) {
      return;
    }
    if (!guardEntryOnTop()) {
      pushGuardEntry();
      return;
    }
    // 잠금 신호가 닿기 전의 앞으로 가기 스와이프가 닫힌 창의 항목으로 오면 창을 열지 않고 되돌린다.
    if (page === null && pageEntryOnTop()) {
      window.history.back();
    }
  });
  useEffect(() => {
    const handlePopState = () => onGuardPopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  /**
   * 방을 떠나기
   *
   * `homeUrl`은 앞쪽 항목을 지울 때 쓰는 경로라 어디로 떠나든 그 방의 홈을 넘긴다.
   * 지킴 항목을 쌓기 전이면 걷을 것이 없어 곧바로 떠난다.
   */
  function leaveThen(homeUrl: string, leave: () => void) {
    if (leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    if (!armedRef.current) {
      leave();
      return;
    }
    // WebKit은 History API를 짧은 동안 너무 많이 부르면 예외를 던진다.
    // 항목이 남더라도 방을 못 나가는 것보다 낫다.
    void clearEntriesAboveRoom(closeInFlight(), homeUrl)
      .catch(() => undefined)
      .then(leave);
  }

  return { openPage, closePage, leaveThen };
}
