import { useCallback, useEffect, useState } from "react";

import { markUpdateNoticeSeen, shouldShowUpdateNotice } from "./updateNotice";
import { UpdateNoticeSheet } from "./UpdateNoticeSheet";

/**
 * U1 업데이트 안내 시트의 **트리거 지점**
 * (`apps/mobile/components/UpdateNoticeSheetHost.tsx`에서 이식 — BY-329.
 * 스펙: SCR-U1-update-sheet.md Exposure Control · Interaction Contract).
 *
 * 홈(S1) 안에 마운트되는 한 줄짜리 컨테이너다 — 홈 화면 파일이 게이트 로직을 알 필요가 없게
 * 게이트 호출·상태 보유·닫힘 처리를 여기로 모았다.
 *
 * **기본은 "아무것도 렌더하지 않음"이다** — `enabled === true` 그리고 `seen === false`일 때만
 * 시트가 올라온다. 게이트는 fail-closed라 조회가 실패해도 결과는 같다(`updateNotice.ts`).
 * 노출 위치는 홈뿐이다 — 기록(S5)·설정(S6)·세션 화면에는 마운트하지 않는다.
 */
export function UpdateNoticeSheetHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 게이트는 절대 reject하지 않지만, 홈 렌더가 이 판정 때문에 깨지지 않게 마지막 방어선을 둔다.
    void shouldShowUpdateNotice()
      .then((show) => {
        if (!cancelled && show) {
          setVisible(true);
        }
      })
      .catch((error: unknown) => {
        console.warn("[update-notice] 노출 판정 실패 — 노출하지 않는다", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 닫힘 처리와 `seen` 저장을 **한 함수로 묶는다**(스펙 지시) — 닫기 경로가 늘어나도
   * "닫혔는데 seen이 저장되지 않아 다시 뜨는" 중복 노출 버그가 생기지 않게 한다.
   */
  const dismiss = useCallback(() => {
    setVisible(false);
    // 저장 실패는 삼켜진다 — 최악이 다음 실행에서 한 번 더 뜨는 것이다.
    void markUpdateNoticeSeen();
  }, []);

  return (
    <UpdateNoticeSheet
      visible={visible}
      onConfirm={dismiss}
      // `onDismissRequest`는 의도적으로 넘기지 않는다 — 딤 탭 닫기는 미정(RN판과 동일 결정).
    />
  );
}
