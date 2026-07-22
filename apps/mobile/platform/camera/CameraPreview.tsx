import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import type { CameraType } from "./types";

interface CameraPreviewProps {
  facing: CameraType;
  enabled: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * 카메라 미리보기 어댑터 — 현재는 mock(placeholder)이다. MVP는 WebView로 카메라를 다루므로
 * 이 네이티브 어댑터는 당장 쓰이지 않고 전환용으로만 보존한다. 실제 구현은 네이티브 전환 시
 * `expo-camera`(혹은 대체 라이브러리)로 교체한다.
 * 배경: docs/adr/0003-phased-rollout-webview-mvp-then-native.md
 */
export function CameraPreview({ facing, enabled, style }: CameraPreviewProps) {
  if (!enabled) {
    return <View className="items-center justify-center bg-gray-900" style={style} />;
  }
  return (
    <View className="items-center justify-center bg-gray-800" style={style}>
      <Text className="text-xs text-gray-400">카메라 미리보기 (mock, {facing})</Text>
    </View>
  );
}
