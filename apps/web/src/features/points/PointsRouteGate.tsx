import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { baseSearch } from "@/features/group-room/groupTabSearch";
import { GroupLoginGate } from "@/features/login/GroupLoginGate";
import { GroupLoginScreen } from "@/features/login/GroupLoginScreen";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { useIdentityPending, useUserId } from "@/lib/userId";

import { appPointsGateway } from "./components/shop/appPointsGateway";
import { PointsGatewayProvider, usePointsGatewayProvided } from "./gateway/PointsGatewayContext";

/**
 * 포인트 화면의 입구
 *
 * 플래그가 꺼져 있으면 홈으로 보낸다.
 * 포인트는 로그인한 사용자만 쓰므로 비회원에게는 그 주소에 기존 로그인 화면을 그린다.
 * 신원이 끝내 없는 문서도 누구의 포인트인지 알 수 없어 같은 로그인 화면을 그린다.
 */
export function PointsRouteGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  // 개발용 화면 모음은 장면별 가짜 경계와 미리 보기 사용자를 직접 넣는다.
  if (usePointsGatewayProvided()) {
    return children;
  }
  if (!isPointsEnabled()) {
    return <Navigate to={{ pathname: "/home", search: baseSearch(location.search) }} replace />;
  }
  return (
    <GroupLoginGate entry="points">
      <WithUser>{children}</WithUser>
    </GroupLoginGate>
  );
}

function WithUser({ children }: { children: ReactNode }) {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  if (identityPending) {
    return null;
  }
  if (userId === null) {
    return <GroupLoginScreen entry="points" />;
  }
  return (
    <PointsGatewayProvider gateway={appPointsGateway} userId={userId}>
      {children}
    </PointsGatewayProvider>
  );
}
