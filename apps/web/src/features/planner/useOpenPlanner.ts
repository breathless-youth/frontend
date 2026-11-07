import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";
import { plannerDateKeyOf } from "./plannerDay";

/** 플래너를 연 곳 — 라우터 state로 넘긴다(URL에 싣지 않아 분석 경로가 하나로 유지된다). */
export type PlannerEntry = "records" | "home";

/**
 * 플래너가 어디서 열렸는지 읽는다. 열 때 router state와 `?from` 쿼리 둘 다에 싣는다. 웹뷰가 다시
 * 로드되면(iOS 콘텐츠 프로세스 종료 뒤의 `reload()` 등) state와 SPA 스택은 사라지고 지금 URL만
 * 남으므로 `?from`이 들어온 탭의 유일한 근거다.
 */
export function plannerEntryOf(location: { state: unknown; search: string }): PlannerEntry | null {
  const via =
    (location.state as { via?: unknown } | null)?.via ??
    new URLSearchParams(location.search).get("from");
  return via === "records" || via === "home" ? via : null;
}

/**
 * 플래너로 이동하는 함수를 돌려준다. 날짜를 주면 그날의 플래너, 안 주면 오늘의 플래너다.
 * 셸이 붙인 쿼리(구 앱의 신원 등)는 그대로 들고 간다.
 */
export function useOpenPlanner(via: PlannerEntry) {
  const navigate = useNavigate();
  const location = useLocation();
  /**
   * 이동 래치. react-router `navigate()`는 무조건 push라 빠른 이중 탭에서 플래너가 두 장 쌓여
   * 뒤로가기를 두 번 눌러야 한다. 부르는 화면은 이동하면 언마운트되므로 돌아오면 다시 풀린다.
   */
  const openedRef = useRef(false);

  return (dateKey?: string, options?: { editRecords?: boolean; returnDate?: string }) => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    const params = new URLSearchParams(location.search);
    const today = plannerDateKeyOf(new Date());
    // 기록 탭은 자정 날짜, 편집기는 05시 날짜다. 새벽의 오늘은 아직 시작하지 않은
    // 플래너를 열지 않고 현재 플래너를 연다. 과거 날짜의 추가는 그날 05시부터다.
    const targetDate =
      options?.editRecords && (dateKey === undefined || dateKey > today) ? today : dateKey;
    if (targetDate === undefined) {
      params.delete("date");
    } else {
      params.set("date", targetDate);
    }
    params.set("from", via);
    params.delete("edit");
    params.delete("returnDate");
    if (options?.editRecords) {
      params.set("edit", "records");
      const returnDate = options.returnDate ?? dateKey;
      if (returnDate && returnDate !== targetDate) params.set("returnDate", returnDate);
    }
    const search = params.toString();
    slideNavigate("forward", () => {
      navigate(
        { pathname: "/planner", search: search === "" ? "" : `?${search}` },
        { state: { via } },
      );
    });
  };
}
