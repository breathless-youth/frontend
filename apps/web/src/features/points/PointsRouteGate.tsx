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
import { usePointsLogin } from "./usePointsLogin";

/**
 * 포인트 화면의 입구
 *
 * 플래그가 꺼져 있으면 홈으로 보낸다.
 * 신원이 없으면 그 주소에 기존 로그인 화면을 그리고, 확인하는 동안은 뼈대를 둔다.
 * 비회원은 서버가 조회를 열어 주면 화면을 구경하고, 서버가 회원 전용이라고 거절하면 로그인 화면을 본다.
 * 받기와 사기처럼 회원만 할 수 있는 일은 화면 안의 문이 로그인 화면으로 보낸다.
 * 다른 화면 속 조각(`embedded`)은 회원에게만 그리고, 로그인 화면 대신 아무것도 그리지 않는다.
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
  return <Identified embedded={embedded}>{children}</Identified>;
}

function Identified({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  const access = usePointsAccess();
  const requestLogin = usePointsLogin();
  if (access.status === "pending") {
    return embedded ? null : <GateSkeleton />;
  }
  if (access.status === "denied") {
    return embedded ? null : <GroupLoginScreen entry="points" />;
  }
  const member = access.status === "member";
  if (embedded && !member) {
    return null;
  }
  return (
    <PointsGatewayProvider
      gateway={appPointsGateway()}
      userId={access.userId}
      member={member}
      requestLogin={requestLogin}
    >
      {embedded ? children : <ServerReadCheck member={member}>{children}</ServerReadCheck>}
    </PointsGatewayProvider>
  );
}

/**
 * 서버가 이 사용자에게 포인트 조회를 열어 주는지
 *
 * 모든 포인트 화면이 잔액을 받으므로 그 조회의 회원 전용 거절을 화면 전체의 판정으로 쓴다.
 * 비회원은 거절될 수 있어서, 잔액이 오기 전에 화면을 그렸다가 로그인 화면으로 바뀌지 않게 답을 기다린다.
 */
function ServerReadCheck({ children, member }: { children: ReactNode; member: boolean }) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const balance = useQuery(balanceQuery(gateway, userId));
  if (isMemberOnlyError(balance.error)) {
    return <GroupLoginScreen entry="points" />;
  }
  if (!member && balance.isPending) {
    return <GateSkeleton />;
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
