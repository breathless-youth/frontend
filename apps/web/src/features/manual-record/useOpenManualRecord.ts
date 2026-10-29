import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";

import type { ManualRecordMode } from "./manualRecord";

/**
 * 입력 화면이 주소에서 읽는 쿼리. 웹뷰가 다시 로드되면 라우터 state는 사라지고 주소만 남아 전부 쿼리로 싣는다.
 * 페이지의 폴백 이동과 렌더러 종료 복구 보고가 같은 목록을 쓴다.
 */
export const MANUAL_RECORD_PARAMS = ["date", "entry", "start", "id", "subject"] as const;

export type ManualRecordTarget =
  | {
      kind: "add";
      dateKey: string;
      entry: Extract<ManualRecordMode, { kind: "add" }>["entry"];
      startMs?: number;
      subjectId?: number;
    }
  | {
      kind: "edit";
      dateKey: string;
      entry: Extract<ManualRecordMode, { kind: "edit" }>["entry"];
      id: number;
    };

/**
 * 시간 직접 입력 화면으로 이동하는 함수를 돌려준다.
 * 셸이 붙인 쿼리(구 앱의 신원, 플래너의 `from` 등)는 그대로 들고 가고, 입력 화면 쿼리만 새로 쓴다.
 */
export function useOpenManualRecord() {
  const navigate = useNavigate();
  const location = useLocation();
  /** 빠른 이중 탭에 입력 화면이 두 장 쌓이지 않게 막는다. 부르는 화면은 이동하면 언마운트되어 돌아오면 풀린다. */
  const openedRef = useRef(false);

  return (target: ManualRecordTarget) => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    const params = new URLSearchParams(location.search);
    for (const key of MANUAL_RECORD_PARAMS) {
      params.delete(key);
    }
    params.set("date", target.dateKey);
    params.set("entry", target.entry);
    if (target.kind === "edit") {
      params.set("id", String(target.id));
    } else {
      if (target.startMs !== undefined) {
        params.set("start", String(target.startMs));
      }
      if (target.subjectId !== undefined) {
        params.set("subject", String(target.subjectId));
      }
    }
    slideNavigate("forward", () => {
      navigate({ pathname: "/manual-record", search: `?${params.toString()}` });
    });
  };
}
