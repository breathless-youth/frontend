import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * `onFinished`는 **공지 흐름이 끝났음**을 정확히 한 번 알린다: 띄울 공지가 없다고 확정됐거나
 * (빈 목록·전부 dismiss·조회 실패), 띄운 공지가 닫혔을 때다. 홈탭은 이 신호를 받은 뒤에야
 * U1 안내를 마운트한다 — "공지(U2) 먼저, U1은 그 뒤" 순서(결정 7, 2026-08-16 변경)의
 * 단일 조정 지점이다.
 */
export function NoticePopupHost({ onFinished }: { onFinished: () => void }) {
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

  // onFinished는 한 번만 — 조회 실패 후 재시도 성공 같은 상태 변화로 두 번 알리지 않는다.
  const finishedRef = useRef(false);
  const finish = useCallback(() => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      onFinished();
    }
  }, [onFinished]);

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
        } else {
          finish();
        }
      })
      .catch((error: unknown) => {
        console.warn("[notice] 노출 판정 실패 — 노출하지 않는다", error);
        finish();
      });
    return () => {
      cancelled = true;
    };
  }, [notices.data, decided, finish]);

  useEffect(() => {
    if (notices.isError) {
      // 조회 실패는 무해 실패다 — console.warn만, Sentry reportHandled 미사용(결정 6).
      console.warn("[notice] 활성 공지 조회 실패 — 노출하지 않는다", notices.error);
      finish();
    }
  }, [notices.isError, notices.error, finish]);

  /** X·확인 공용 — 이번 방문만 닫는다. 아무것도 저장하지 않는다(다음 방문 재노출, 결정 4). */
  const close = useCallback(() => {
    setVisible(false);
    finish();
  }, [finish]);

  /** "다시 보지 않기" — 닫고 이 공지 ID를 영구 dismiss한다. 저장 실패는 게이트가 삼킨다. */
  const neverShowAgain = useCallback(() => {
    setVisible(false);
    finish();
    if (notice !== null) {
      void markNoticeDismissed(notice.id);
    }
  }, [notice, finish]);

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
