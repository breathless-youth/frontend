import { useEffect } from "react";

import { recordLastHiddenAt } from "./interviewStore";

/**
 * 문서가 가려진 시각 기록
 *
 * 탭 웹뷰 여러 개가 동시에 살아 있어 어느 문서든 가려질 때 쓴다.
 * 탭을 바꾸면 떠나는 탭이 시각을 바로 갱신해, 홈으로 돌아올 때 간격이 0에 가깝다.
 * 그래서 탭 이동은 재방문으로 세지 않고 앱을 백그라운드로 보냈을 때만 간격이 벌어진다.
 */
export function useRecordLastHidden(): void {
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        recordLastHiddenAt(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
