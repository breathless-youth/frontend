import { createContext, useContext, type ReactNode } from "react";

import type { PointsGateway } from "./PointsGateway";

type PointsGatewayValue = {
  gateway: PointsGateway;
  userId: number;
  /** 회원으로 확인된 사용자인지이며 비회원은 구경만 하고 받기와 사기는 로그인 뒤에 한다. */
  member: boolean;
  /** 회원만 할 수 있는 일을 비회원이 하려고 할 때 로그인 화면을 여는 함수 */
  requestLogin: () => void;
};

const PointsGatewayContext = createContext<PointsGatewayValue | null>(null);

const noop = () => {};

/**
 * 포인트 화면의 경계와 신원 주입
 *
 * 조회 키에 사용자를 넣어야 해서 경계와 함께 그 경계가 누구의 것인지도 넘긴다.
 * 개발용 화면 모음은 장면마다 다른 가짜 경계와 미리 보기 사용자를 넣고, 회원 여부를 넘기지 않으면 회원으로 본다.
 */
export function PointsGatewayProvider({
  gateway,
  userId,
  member = true,
  requestLogin = noop,
  children,
}: Pick<PointsGatewayValue, "gateway" | "userId"> &
  Partial<Pick<PointsGatewayValue, "member" | "requestLogin">> & { children: ReactNode }) {
  return (
    <PointsGatewayContext value={{ gateway, userId, member, requestLogin }}>
      {children}
    </PointsGatewayContext>
  );
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

/** 회원인지와 로그인 화면을 여는 함수이며 회원만 할 수 있는 일의 문이 읽는다. */
// eslint-disable-next-line react-refresh/only-export-components -- 공급자와 그 값을 읽는 훅을 한 파일에 둔다
export function usePointsMembership(): Pick<PointsGatewayValue, "member" | "requestLogin"> {
  const { member, requestLogin } = usePointsContext();
  return { member, requestLogin };
}

/** 바깥에서 이미 경계를 넣었는지이며 개발용 화면 모음이 라우트의 입구를 건너뛸 때 본다. */
// eslint-disable-next-line react-refresh/only-export-components -- 공급자와 그 값을 읽는 훅을 한 파일에 둔다
export function usePointsGatewayProvided(): boolean {
  return useContext(PointsGatewayContext) !== null;
}
