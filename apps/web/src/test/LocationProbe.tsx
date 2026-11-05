import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";

/** 앱 안에서 이동한 지금 주소를 테스트에 알리는 빈 컴포넌트 */
export function LocationProbe({ onLocation }: { onLocation: (location: Location) => void }) {
  const location = useLocation();
  useLayoutEffect(() => {
    onLocation(location);
  });
  return null;
}
