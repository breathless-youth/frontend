import { useLocation, useNavigate } from "react-router-dom";

import { slideNavigate } from "@/lib/pageTransition";

import { pointsSearch } from "./pointsSearch";

/** 비회원이 회원만 할 수 있는 일을 하려고 할 때 여는 로그인 화면의 주소 */
export const POINTS_LOGIN_PATH = "/points/login";

/**
 * 포인트 화면에서 로그인 화면 열기
 *
 * 로그인 화면을 기록에 쌓아서, 뒤로 가기나 로그인 뒤에 보던 화면으로 돌아오게 한다.
 */
export function usePointsLogin(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () =>
    slideNavigate("forward", () =>
      navigate({ pathname: POINTS_LOGIN_PATH, search: pointsSearch(location.search) }),
    );
}
