import { createContext, useContext, type ReactNode } from "react";

import type { PointsGateway } from "./PointsGateway";

type PointsGatewayValue = { gateway: PointsGateway; userId: number };

const PointsGatewayContext = createContext<PointsGatewayValue | null>(null);

/**
 * 포인트 화면의 경계와 신원 주입
 *
 * 조회 키에 사용자를 넣어야 해서 경계와 함께 그 경계가 누구의 것인지도 넘긴다.
 * 개발용 화면 모음은 장면마다 다른 가짜 경계와 미리 보기 사용자를 넣는다.
 */
export function PointsGatewayProvider({
  gateway,
  userId,
  children,
}: PointsGatewayValue & { children: ReactNode }) {
  return <PointsGatewayContext value={{ gateway, userId }}>{children}</PointsGatewayContext>;
}

function usePointsContext(): PointsGatewayValue {
  const value = useContext(PointsGatewayContext);
  if (value === null) {
    throw new Error("usePointsGateway must be used inside PointsGatewayProvider");
  }
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components -- 공급자와 그 값을 읽는 훅을 한 파일에 둔다
export function usePointsGateway(): PointsGateway {
  return usePointsContext().gateway;
}

// eslint-disable-next-line react-refresh/only-export-components -- 공급자와 그 값을 읽는 훅을 한 파일에 둔다
export function usePointsUserId(): number {
  return usePointsContext().userId;
}

/** 바깥에서 이미 경계를 넣었는지이며 개발용 화면 모음이 라우트의 입구를 건너뛸 때 본다. */
// eslint-disable-next-line react-refresh/only-export-components -- 공급자와 그 값을 읽는 훅을 한 파일에 둔다
export function usePointsGatewayProvided(): boolean {
  return useContext(PointsGatewayContext) !== null;
}
