import { useEffect, useEffectEvent, useRef } from "react";
import type { RefObject } from "react";

/**
 * 열린 페이지를 표시하는 history 항목의 키
 *
 * 페이지를 열 때 URL은 바꾸지 않고 항목을 하나 쌓아서, iOS 가장자리 스와이프와 브라우저 뒤로 가기가 세션이 아니라 페이지만 닫게 한다.
 * 라우터 상태(`idx`·`key`)를 함께 복사해 두어 그 항목에서 뒤로 가도 라우터는 같은 화면으로 본다.
 */
const PAGE_HISTORY_KEY = "sessionPage";

/** 지금 history 항목이 이 화면이 쌓은 페이지 항목인가. */
export function pageEntryOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && PAGE_HISTORY_KEY in state;
}

export type PageCloseReason = "back" | "play";

/**
 * 닫기 요청 없이 사라지는 페이지의 표시 항목 걷어 내기
 *
 * 세션이 끝나거나 화면이 통째로 사라질 때 부른다.
 * 남겨 두면 결과 화면으로 바꿔 끼울 때 그 아래에 세션 항목이 남아, 뒤로 가기로 새 세션이 열린다.
 * 이미 되돌리는 중이면 한 번 더 되돌리지 않는다. 두 번 되돌리면 세션 화면 밖으로 나간다.
 */
function dropPageEntry(closing: RefObject<PageCloseReason | null>) {
  if (closing.current === null && pageEntryOnTop()) {
    closing.current = "back";
    window.history.back();
  }
}

/**
 * 세션 위 페이지를 history 항목과 함께 여닫기
 *
 * 가장자리 스와이프, 뒤로 버튼, Escape가 모두 popstate 한 곳에서 끝나서 어느 길로 닫아도 history가 어긋나지 않는다.
 * 페이지 상태는 호출부가 들고 있다.
 * 세션이 끝나는 순간 호출부가 렌더 중에 페이지를 비워야 해서다.
 */
export function useSessionPageHistory<Page extends string>({
  page,
  setPage,
  studying,
  onClosed,
  beforePush,
}: {
  page: Page | null;
  setPage: (next: Page | null) => void;
  studying: boolean;
  /** 사용자가 닫은 뒤에만 불린다. 세션이 끝나 사라진 페이지는 닫은 것이 아니다. */
  onClosed: (closed: Page | null, closedBy: PageCloseReason) => void;
  /** 페이지 항목을 쌓기 직전에 불린다. 그 아래에 항목을 더 둘 화면이 쓴다. */
  beforePush?: () => void;
}) {
  /**
   * 닫기를 요청한 까닭
   *
   * 닫기는 history를 한 칸 되돌린 뒤 popstate에서 마무리한다.
   * 그사이 다시 온 요청은 무시한다. 두 번 되돌리면 세션 화면 밖으로 나간다.
   */
  const closingRef = useRef<PageCloseReason | null>(null);

  function openPage(next: Page) {
    closingRef.current = null;
    // 앞으로 가기나 새로고침으로 이미 표시 항목에 와 있으면 그 항목을 다시 쓴다.
    // 하나 더 쌓으면 뒤로 가기를 두 번 해야 닫힌다.
    if (!pageEntryOnTop()) {
      beforePush?.();
      window.history.pushState({ ...(window.history.state ?? {}), [PAGE_HISTORY_KEY]: next }, "");
    }
    setPage(next);
  }

  function finishClosingPage() {
    // 요청 없이 온 popstate는 가장자리 스와이프나 브라우저 뒤로 가기다.
    const closedBy = closingRef.current ?? "back";
    closingRef.current = null;
    onClosed(page, closedBy);
    setPage(null);
  }

  /**
   * 페이지 닫기 요청
   *
   * 뒤로 버튼·Escape는 `back`, 재생 버튼은 `play`다.
   * 표시 항목이 맨 위에 없으면 되돌릴 항목이 없으므로 바로 닫는다.
   */
  function closePage(reason: PageCloseReason) {
    if (closingRef.current !== null) {
      return;
    }
    closingRef.current = reason;
    if (pageEntryOnTop()) {
      window.history.back();
      return;
    }
    finishClosingPage();
  }

  /** 페이지 항목을 되돌리라고 요청했는데 아직 popstate가 오지 않았는가. */
  function closeInFlight() {
    return closingRef.current !== null && pageEntryOnTop();
  }

  const onPagePopState = useEffectEvent(finishClosingPage);
  useEffect(() => {
    if (page === null) {
      return;
    }
    const handlePopState = () => onPagePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [page]);

  useEffect(() => {
    if (!studying) {
      dropPageEntry(closingRef);
    }
  }, [studying]);
  useEffect(() => () => dropPageEntry(closingRef), []);

  return { openPage, closePage, closeInFlight };
}
