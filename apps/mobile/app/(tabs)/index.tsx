import { useIsFocused } from "@react-navigation/native";

import { RemoteScreen } from "../../components/RemoteScreen";
import { HomeTabSkeleton } from "../../components/RemoteSplashSkeletons";
import { UpdateNoticeSheetHost } from "../../components/UpdateNoticeSheetHost";

/**
 * S1 · 홈 — 화면 구현체는 `apps/web`이고, 여기서는 `RemoteScreen`(BY-333)으로 `/home`을
 * 로드한다. 통계·"집중 시작" 플로우·온보딩 가이드는 전부 웹이 소유한다 — 여기에 화면 로직을
 * 넣지 않는다(BY-334 온보딩 웹 이관으로 네이티브 가이드 배선은 더 이상 이 화면의 몫이 아니다).
 *
 * "집중 시작"은 웹이 보내는 `start-session` 브리지 메시지로 오고, `RemoteScreen`이 공용
 * 핸들러(`lib/nativeBridgeHandler.ts`)로 처리한다 — 세션 화면과 동일 규칙.
 *
 * U1 업데이트 안내 시트는 네이티브 오버레이라 웹 콘텐츠와 무관하게 그대로 홈에 얹는다.
 */
export default function HomeScreen() {
  const isFocused = useIsFocused();
  return (
    <>
      <RemoteScreen
        suppressTabBarMessages={!isFocused}
        testID="home-webview"
        path="/home"
        splash={<HomeTabSkeleton />}
      />
      <UpdateNoticeSheetHost />
    </>
  );
}
