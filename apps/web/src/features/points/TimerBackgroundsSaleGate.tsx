import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { TIMER_BACKGROUNDS_ON_SALE } from "./model/onSale";
import { pointsSearch } from "./pointsSearch";

/**
 * 타이머 배경 화면의 판매 확인
 *
 * 팔지 않는 동안 앱의 화면 복원이나 예전 링크로 배경 주소에 들어오면 꾸미기 상점으로 돌려보낸다.
 */
export function TimerBackgroundsSaleGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!TIMER_BACKGROUNDS_ON_SALE) {
    return <Navigate to={{ pathname: "/points", search: pointsSearch(location.search) }} replace />;
  }
  return children;
}
