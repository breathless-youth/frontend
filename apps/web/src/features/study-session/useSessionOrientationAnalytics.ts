import { useEffect } from "react";

import { trackSessionOrientationChanged, type StudyRoomType } from "@/lib/amplitude";

function currentOrientation(): "portrait" | "landscape" {
  return window.innerWidth <= window.innerHeight ? "portrait" : "landscape";
}

/**
 * 세션 화면의 회전을 이벤트로 남긴다(BY-616, 2026-09-05) — 가로 거치 모드(S3-5·S3-6, 소셜룸 가로
 * 그리드)를 실제로 쓰는지는 클릭이 아니라 기기 회전이라 autocapture가 못 본다. 룸(싱글·소셜)이
 * 마운트된 동안만 건다.
 *
 * 판정은 `RoomPage`의 회전 단계 훅과 같은 뷰포트 비율(`innerWidth`/`innerHeight`)이다 — `matchMedia`는
 * 세션 레이아웃이 CSS 미디어쿼리만으로 판정한다는 계약(`sessionLandscape.test.tsx`)을 건드리지 않으려고
 * 쓰지 않는다. `resize`는 키보드·주소창 변화에도 오므로 **방향이 실제로 바뀐 경우**만 남기고, iOS는
 * 회전 도중의 resize가 이전 방향을 보고할 수 있어 `orientationchange`도 함께 받는다(둘 다 와도 방향이
 * 한 번 바뀐 것이라 한 건이다). 마운트 시점의 방향은 찍지 않는다 — 진입은 거의 세로라 정보가 없고,
 * 회전 사건 자체가 관심사다.
 */
export function useSessionOrientationAnalytics(roomType: StudyRoomType): void {
  useEffect(() => {
    let last = currentOrientation();
    const check = () => {
      const next = currentOrientation();
      if (next === last) {
        return;
      }
      last = next;
      trackSessionOrientationChanged({ orientation: next, roomType });
    };
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, [roomType]);
}
