import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import type { LoginEntry } from "@/lib/amplitude";

import { GroupLoginScreen } from "./GroupLoginScreen";
import { useGroupAccess } from "./useGroupAccess";

/**
 * 그룹 화면의 로그인 게이트
 *
 * 비회원이면 그 주소에 로그인 화면을 대신 그린다.
 * 로그인하면 같은 주소가 그대로 그룹 화면을 그리므로 돌아갈 주소를 따로 기억하지 않는다.
 * 감싼 화면이 없으면 레이아웃 라우트로 쓰여 하위 라우트를 그린다.
 */
export function GroupLoginGate({ entry, children }: { entry: LoginEntry; children?: ReactNode }) {
  const access = useGroupAccess();
  if (access === "pending") {
    return null;
  }
  if (access === "guest") {
    return <GroupLoginScreen entry={entry} />;
  }
  return children ?? <Outlet />;
}
