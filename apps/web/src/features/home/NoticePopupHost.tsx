import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  fetchActiveNotices,
  markNoticeDismissed,
  selectNoticeToShow,
  type NoticeResponse,
} from "./notice";
import { NoticePopup } from "./NoticePopup";

/**
 * U2 공지 팝업의 **트리거 지점** (스펙 §4.3, BY-377) — U1 `UpdateNoticeSheetHost`와 같은
 * 역할: 홈(S1)에 마운트되는 한 줄짜리 컨테이너로, 조회·게이트 호출·상태 보유·닫기 동선을
 * 여기 모은다. 홈 화면 파일은 게이트 로직을 모른다.
 *
 * 조회는 react-query다(`useHomeSummary` 관례) — 홈 렌더를 막지 않는다: 응답이 오기 전에는
 * 아무것도 렌더하지 않고, 실패해도 fail-closed로 조용히 사라진다(결정 6).
 */
export function NoticePopupHost() {
  const notices = useQuery({
    queryKey: ["notices", "active"],
    queryFn: fetchActiveNotices,
    // 한 방문에 보이는 공지는 1개 고정이다(결정 3) — 방문 중 재조회로 목록이 바뀔 이유가 없다.
    staleTime: Infinity,
  });

  const [notice, setNotice] = useState<NoticeResponse | null>(null);
  const [visible, setVisible] = useState(false);
  // X·확인은 "이번 방문만 닫음"(결정 4) — 닫힌 뒤 쿼리가 갱신돼도 같은 방문에서 다시 띄우지 않는다.
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (notices.data === undefined || decided) {
      return undefined;
    }
    let cancelled = false;
    // 게이트는 절대 reject하지 않지만, 홈 렌더가 이 판정 때문에 깨지지 않게 마지막 방어선을 둔다.
    void selectNoticeToShow(notices.data)
      .then((selected) => {
        if (cancelled) {
          return;
        }
        setDecided(true);
        if (selected !== null) {
          setNotice(selected);
          setVisible(true);
        }
      })
      .catch((error: unknown) => {
        console.warn("[notice] 노출 판정 실패 — 노출하지 않는다", error);
      });
    return () => {
      cancelled = true;
    };
  }, [notices.data, decided]);

  useEffect(() => {
    if (notices.isError) {
      // 조회 실패는 무해 실패다 — console.warn만, Sentry reportHandled 미사용(결정 6).
      console.warn("[notice] 활성 공지 조회 실패 — 노출하지 않는다", notices.error);
    }
  }, [notices.isError, notices.error]);

  /** X·확인 공용 — 이번 방문만 닫는다. 아무것도 저장하지 않는다(다음 방문 재노출, 결정 4). */
  const close = useCallback(() => {
    setVisible(false);
  }, []);

  /** "다시 보지 않기" — 닫고 이 공지 ID를 영구 dismiss한다. 저장 실패는 게이트가 삼킨다. */
  const neverShowAgain = useCallback(() => {
    setVisible(false);
    if (notice !== null) {
      void markNoticeDismissed(notice.id);
    }
  }, [notice]);

  if (!visible || notice === null) {
    return null;
  }
  return (
    <NoticePopup
      notice={notice}
      onConfirm={close}
      onClose={close}
      onNeverShowAgain={neverShowAgain}
    />
  );
}
