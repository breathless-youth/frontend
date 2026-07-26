import { useCallback, useEffect, useState } from "react";

import { markUpdateNoticeSeen, shouldShowUpdateNotice } from "../lib/updateNotice";
import { UpdateNoticeSheet } from "./UpdateNoticeSheet";

/**
 * U1 업데이트 안내 시트의 **트리거 지점**
 * (`frontend/docs/screens/SCR-U1-update-sheet.md` Exposure Control · Interaction Contract).
 *
 * 홈(S1) 안에 마운트되는 한 줄짜리 컨테이너다 — 홈 화면 파일이 게이트 로직을 알 필요가 없게
 * 게이트 호출·상태 보유·닫힘 처리를 여기로 모았다. 시트 자체(`UpdateNoticeSheet`)는 순수
 * 프레젠테이션으로 남는다.
 *
 * ## 기본은 "아무것도 렌더하지 않음"이다
 *
 * `enabled === true` **그리고** `seen === false`일 때만 시트가 올라온다. `app.json`의
 * `extra.updateNoticeEnabled`가 `false`로 커밋돼 있으므로 **기본 상태에서는 딤조차 그리지
 * 않는다**. 게이트는 fail-closed라 조회가 실패해도 결과는 같다(`lib/updateNotice.ts` 참고).
 *
 * ## 노출 위치·시점
 *
 * 노출 위치는 홈뿐이다 — 기록(S5)·설정(S6)·세션 화면에는 마운트하지 않는다. 시점은 "홈 진입
 * 직후"로 둔다(Figma 프레임이 홈 초기 상태 위에 떠 있다).
 * ⚠️ 지연을 둘지 여부는 문서화돼 있지 않아 **임의로 지연값을 만들지 않았다.**
 * TODO(SCR-U1-update-sheet.md Review Checklist): 노출 타이밍(즉시 vs 지연) 확정 필요.
 */
export function UpdateNoticeSheetHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 게이트는 절대 reject하지 않지만(모든 실패를 "노출 안 함"으로 흡수), 홈 렌더가 이
    // 판정 때문에 깨지는 일이 없도록 마지막 방어선을 둔다.
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
   * 닫힘 처리와 `seen` 저장을 **한 함수로 묶는다**(스펙 지시) — 나중에 딤 탭·스와이프·백 버튼이
   * 확정돼 닫기 경로가 늘어나도 "닫혔는데 seen이 저장되지 않아 다시 뜨는" 중복 노출 버그가
   * 생기지 않게 하기 위해서다.
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
      /*
        `onDismissRequest`를 의도적으로 넘기지 않는다 — 딤 탭·스와이프·백 버튼 닫기는 전부
        미정이라 동작을 켜지 않는다(스펙 Interaction Contract). 확정되면 여기에 `dismiss`를
        연결하기만 하면 된다(경로별로 분기가 필요하면 `source`로 구분).
        TODO(SCR-U1-update-sheet.md Review Checklist): 닫기 경로 확정 필요.
      */
    />
  );
}
