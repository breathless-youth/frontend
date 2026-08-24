import { useIsFocused } from "@react-navigation/native";

import { RemoteScreen } from "../../components/RemoteScreen";
import { SettingsTabSkeleton } from "../../components/RemoteSplashSkeletons";

/**
 * S6 · 설정 — 화면 구현체는 `apps/web`이고, 여기서는 `RemoteScreen`(BY-333)으로 `/settings`를
 * 로드한다. 카메라 권한 표시·문의·약관 등 행 구성은 전부 웹이 소유한다.
 *
 * "시스템 설정 열기"는 웹이 보내는 `open-settings` 브리지 메시지로 오고, `RemoteScreen`이
 * 공용 핸들러(`lib/nativeBridgeHandler.ts`)로 OS 설정 앱을 연다 — 세션 화면과 동일 규칙.
 */
export default function SettingsScreen() {
  const isFocused = useIsFocused();
  return (
    <RemoteScreen
      suppressTabBarMessages={!isFocused}
      testID="settings-webview"
      path="/settings"
      splash={<SettingsTabSkeleton />}
    />
  );
}
