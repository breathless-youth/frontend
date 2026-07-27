import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { buildSessionUrl } from "../../lib/webAssetServer";
import { getWebAssetServer } from "../../lib/webAssetServerRegistry";
import { getRegisteredUserId } from "../../lib/userApi";

/**
 * 싱글룸 세션(S3-1~S3-8) — 화면 구현체는 `apps/web`이고 여기서는 WebView로 로드한다(ADR 0001).
 *
 * 이 파일이 하는 일은 셋뿐이다: 로컬 서버를 띄우고, 세션 URL을 조립하고, WebView에 넘긴다.
 * 타이머·상태 판정·이벤트 누적은 전부 웹이 소유한다(설계 문서 §1, 세션 상태 모델 스펙 §1) —
 * **여기에 세션 로직을 넣지 말 것.**
 *
 * `allowsInlineMediaPlayback`·`mediaCapturePermissionGrantType`은 WebView 안의
 * `getUserMedia`가 카메라를 열기 위해 필요하다(ADR 0001 Consequences).
 */
export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [origin, userId] = await Promise.all([
          getWebAssetServer().start(),
          getRegisteredUserId(),
        ]);
        if (!cancelled) {
          setUri(buildSessionUrl(origin, { roomId: id ?? "1", userId }));
        }
      } catch (error: unknown) {
        console.warn("[room] 로컬 웹 자산 서버 기동 실패", error);
        if (!cancelled) {
          setFailed(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0B0F14] px-6">
        <Text className="text-center text-[15px] leading-[22px] text-white/80">
          세션을 시작하지 못했어요
        </Text>
      </View>
    );
  }

  if (uri === null) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0B0F14]">
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <WebView
      testID="session-webview"
      source={{ uri }}
      // 세션 화면은 항상 다크다 — 로딩 중 흰 배경이 번쩍이지 않게 한다.
      style={{ flex: 1, backgroundColor: "#0B0F14" }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // 로컬 서버 외의 오리진으로는 나가지 않는다.
      originWhitelist={["http://localhost:*"]}
    />
  );
}
