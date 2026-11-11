import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { baseSearch } from "@/features/group-room/groupTabSearch";
import { useBackTo } from "@/features/group-room/useBackTo";
import { GroupLoginScreen } from "@/features/login/GroupLoginScreen";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { balanceQuery } from "@/lib/pointsQueries";

import { PointsLoadState } from "./components/shared/PointsLoadState";
import { PointsScreenFrame } from "./components/shared/PointsScreenFrame";
import { appPointsGateway } from "./gateway/appPointsGateway";
import { isMemberOnlyError } from "./gateway/memberOnly";
import {
  PointsGatewayProvider,
  usePointsGateway,
  usePointsGatewayProvided,
  usePointsUserId,
} from "./gateway/PointsGatewayContext";
import { usePointsAccess } from "./usePointsAccess";

/**
 * 포인트 화면의 입구
 *
 * 플래그가 꺼져 있으면 홈으로 보낸다.
 * 포인트는 로그인한 사용자만 쓰므로 회원으로 확인된 때만 화면을 그리고, 확인하는 동안은 뼈대를 둔다.
 * 비회원과 확인하지 못한 경우, 그리고 서버가 회원 전용이라고 거절한 경우는 모두 그 주소에 기존 로그인 화면을 그린다.
 * 다른 화면에 얹힌 조각(`embedded`)은 로그인 화면 대신 아무것도 그리지 않고, 서버 거절은 조각이 받은 조회 실패로 스스로 숨는다.
 */
export function PointsRouteGate({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const location = useLocation();
  // 개발용 화면 모음은 장면별 가짜 경계와 미리 보기 사용자를 직접 넣는다.
  if (usePointsGatewayProvided()) {
    return children;
  }
  if (!isPointsEnabled()) {
    return embedded ? null : (
      <Navigate to={{ pathname: "/home", search: baseSearch(location.search) }} replace />
    );
  }
  return <MemberOnly embedded={embedded}>{children}</MemberOnly>;
}

function MemberOnly({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  const access = usePointsAccess();
  if (access.status === "pending") {
    return embedded ? null : <GateSkeleton />;
  }
  if (access.status === "denied") {
    return embedded ? null : <GroupLoginScreen entry="points" />;
  }
  return (
    <PointsGatewayProvider gateway={appPointsGateway()} userId={access.userId}>
      {embedded ? children : <ServerMemberCheck>{children}</ServerMemberCheck>}
    </PointsGatewayProvider>
  );
}

/** 모든 포인트 화면이 잔액을 받으므로 그 조회의 회원 전용 거절을 화면 전체의 판정으로 쓴다. */
function ServerMemberCheck({ children }: { children: ReactNode }) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const balance = useQuery(balanceQuery(gateway, userId));
  if (isMemberOnlyError(balance.error)) {
    return <GroupLoginScreen entry="points" />;
  }
  return children;
}

function GateSkeleton() {
  const back = useBackTo("/home");
  return (
    <PointsScreenFrame onBack={back} balance={undefined}>
      <PointsLoadState failed={false} message="" onRetry={() => {}} />
    </PointsScreenFrame>
  );
}
