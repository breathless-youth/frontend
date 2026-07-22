import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";
import WebView from "react-native-webview";

/**
 * 스터디룸 화면(MVP). WebRTC(그룹 화상)와 Vision AI(집중도 감지)는 apps/web에 구현되어 있고,
 * 이 화면은 그 웹 앱을 WebView로 로드만 한다. 네이티브 구현(카메라·온디바이스 Vision·LiveKit RN)은
 * `features/study-session/NativeStudyRoomScreen.tsx`에 준비되어 있지만 이번 단계엔 비활성이다.
 * 배경: docs/adr/0001-webview-based-study-room-architecture.md,
 * docs/adr/0003-phased-rollout-webview-mvp-then-native.md
 */
export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const webAppUrl = Constants.expoConfig?.extra?.webAppUrl ?? "http://localhost:5173";

  return (
    <WebView
      source={{ uri: `${webAppUrl}/room/${id}` }}
      style={styles.webview}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaCapturePermissionGrantType="grant"
      originWhitelist={["*"]}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
