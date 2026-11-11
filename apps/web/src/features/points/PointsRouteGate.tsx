import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { baseSearch } from "@/features/group-room/groupTabSearch";
import { useBackTo } from "@/features/group-room/useBackTo";
import { GroupLoginScreen } from "@/features/login/GroupLoginScreen";
import { isPointsEnabled } from "@/lib/pointsCapability";

import { PointsLoadState } from "./components/shared/PointsLoadState";
import { PointsScreenFrame } from "./components/shared/PointsScreenFrame";
import { appPointsGateway } from "./components/shop/appPointsGateway";
import { PointsGatewayProvider, usePointsGatewayProvided } from "./gateway/PointsGatewayContext";
import { usePointsAccess } from "./usePointsAccess";

/**
 * 포인트 화면의 입구
 *
 * 플래그가 꺼져 있으면 홈으로 보낸다.
 * 포인트는 로그인한 사용자만 쓰므로 회원으로 확인된 때만 화면을 그리고, 확인하는 동안은 뼈대를 둔다.
 * 비회원과 확인하지 못한 경우는 모두 그 주소에 기존 로그인 화면을 그린다.
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
  return <MemberOnly>{children}</MemberOnly>;
}

function MemberOnly({ children }: { children: ReactNode }) {
  const access = usePointsAccess();
  if (access.status === "pending") {
    return <GateSkeleton />;
  }
  if (access.status === "denied") {
    return <GroupLoginScreen entry="points" />;
  }
  return (
    <PointsGatewayProvider gateway={appPointsGateway} userId={access.userId}>
      {children}
    </PointsGatewayProvider>
  );
}

function GateSkeleton() {
  const back = useBackTo("/home");
  return (
    <PointsScreenFrame onBack={back} balance={undefined}>
      <PointsLoadState failed={false} message="" onRetry={() => {}} />
    </PointsScreenFrame>
  );
}
