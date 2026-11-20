import { lazy, useEffect } from "react";
import { Outlet } from "react-router-dom";

import { setPcLayoutUserProperty } from "@/lib/amplitude";
import { reloadOnChunkError } from "@/lib/chunkReload";

import { usePcShell } from "./usePcShell";

// 폰과 앱 웹뷰는 PC 셸을 쓰지 않아서 따로 받는다.
const PcShell = lazy(
  reloadOnChunkError(() => import("./PcShell").then((module) => ({ default: module.PcShell }))),
);

/**
 * 탭 화면과 하위 화면을 감싸는 레이아웃 라우트
 *
 * PC면 상단 바와 둥근 페이지 상자 안에, 아니면 지금처럼 화면만 그린다.
 * CSS로 숨기지 않고 둘 중 하나만 그려서 모바일에서는 PC 셸 코드를 받지도 실행하지도 않는다.
 * 셸을 고르는 이 자리가 PC 화면 여부를 아는 한 곳이라 사용자 속성도 여기서 맞춘다.
 */
export function ShellLayout() {
  const pc = usePcShell();
  useEffect(() => {
    setPcLayoutUserProperty(pc);
  }, [pc]);
  return pc ? <PcShell /> : <Outlet />;
}
