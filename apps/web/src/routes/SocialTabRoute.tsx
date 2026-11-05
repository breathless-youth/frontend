import { GroupLoginGate } from "@/features/login/GroupLoginGate";
import { hasGroupRooms } from "@/lib/groupRoomCapability";
import { GroupTabPage } from "@/routes/GroupTabPage";
import { SocialHomePage } from "@/routes/SocialHomePage";

/**
 * 소셜 탭 첫 화면
 *
 * 그룹 공부방 표시가 있는 앱과 개발 서버는 그룹 탭을, 표시가 없는 예전 앱과 브라우저는 지금 소셜 홈을 연다.
 */
export function SocialTabRoute() {
  return hasGroupRooms() ? (
    <GroupLoginGate entry="tab">
      <GroupTabPage />
    </GroupLoginGate>
  ) : (
    <SocialHomePage />
  );
}
