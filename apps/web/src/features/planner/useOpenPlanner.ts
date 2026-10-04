import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";

/** 플래너를 연 곳 — 라우터 state로 넘긴다(URL에 싣지 않아 분석 경로가 하나로 유지된다). */
export type PlannerEntry = "records" | "home";

/**
 * 플래너가 어디서 열렸는지 읽는다. SPA로 들어오면 router state에, 셸이 웹뷰를 다시 띄워 복원한
 * 문서에서는 `?from` 쿼리에 있다(state는 문서와 함께 사라진다 — `lib/nativeScreenReport.ts`).
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

  return (dateKey?: string) => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    const params = new URLSearchParams(location.search);
    if (dateKey === undefined) {
      params.delete("date");
    } else {
      params.set("date", dateKey);
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
