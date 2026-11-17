import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { baseSearch } from "@/features/group-room/groupTabSearch";
import { useBackTo } from "@/features/group-room/useBackTo";
import { GroupLoginScreen } from "@/features/login/GroupLoginScreen";
import { usePointsAccess } from "@/features/points/usePointsAccess";
import { isPointsEnabled } from "@/lib/pointsCapability";

/**
 * 포인트 화면에서 여는 로그인 화면
 *
 * 비회원이 받기나 사기처럼 회원만 할 수 있는 일을 누르면 이 주소로 온다.
 * 화면은 그룹과 설정에서 쓰는 기존 로그인 화면 그대로다.
 * 로그인해서 회원이 되거나 이미 회원인 채로 들어오면 보던 화면으로 돌아간다.
 */
export function PointsLoginPage() {
  const location = useLocation();
  if (!isPointsEnabled()) {
    return <Navigate to={{ pathname: "/home", search: baseSearch(location.search) }} replace />;
  }
  return <LoginUntilMember />;
}

function LoginUntilMember() {
  const access = usePointsAccess();
  const back = useBackTo("/points");
  const member = access.status === "member";
  useEffect(() => {
    if (member) {
      back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 회원으로 바뀐 때만 돌아간다
  }, [member]);
  return <GroupLoginScreen entry="points" />;
}
