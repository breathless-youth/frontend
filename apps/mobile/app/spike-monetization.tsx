/* eslint-disable no-restricted-syntax, @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- 출시하지 않는 실기기 실험 화면이라 문구를 카탈로그에 넣지 않고 SDK를 버튼에서 불러온다 */
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * 보상형 테스트 광고 띄우기
 *
 * Google이 주는 테스트 광고 단위만 쓴다.
 * 서버 확인 옵션에 사용자 ID를 실어 보내는 것까지 본다.
 */
async function showRewardedTestAd(log: (message: string) => void): Promise<void> {
  const ads =
    require("react-native-google-mobile-ads") as typeof import("react-native-google-mobile-ads");
  const started = Date.now();
  await ads.default().initialize();
  log(`광고 SDK 초기화 ${Date.now() - started}ms`);
  const rewarded = ads.RewardedAd.createForAdRequest(ads.TestIds.REWARDED, {
    requestNonPersonalizedAdsOnly: true,
    serverSideVerificationOptions: { userId: "spike-user", customData: "spike-nonce-1" },
  });
  rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
    log(`광고 로드 ${Date.now() - started}ms`);
    void rewarded.show();
  });
  rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, (reward) => {
    log(`보상 신호 ${JSON.stringify(reward)}`);
  });
  rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => log("광고 닫힘"));
  rewarded.addAdEventListener(ads.AdEventType.ERROR, (error) => log(`광고 오류 ${error.message}`));
  rewarded.load();
}

/**
 * 광고 SDK 실기기 스파이크 화면
 *
 * 본 구현에 들어가지 않는 실험용 화면이다.
 * SDK는 버튼을 누를 때 불러와서, 네이티브 모듈이 없는 이전 Dev Client에서도 이 화면 밖은 영향을 받지 않는다.
 */
export default function SpikeMonetizationScreen() {
  const insets = useSafeAreaInsets();
  const [lines, setLines] = useState<string[]>([]);

  const onPress = () => {
    const log = (message: string) => {
      const stamp = new Date().toISOString().slice(11, 23);
      setLines((prev) => [`${stamp} ${message}`, ...prev].slice(0, 80));
    };
    log("▶ 보상형 테스트 광고");
    showRewardedTestAd(log).catch((error: unknown) => {
      log(`✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top + 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", paddingHorizontal: 16 }}>광고 스파이크</Text>
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{
            backgroundColor: "#3671cf",
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>보상형 광고 보기</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={{ fontSize: 12, marginBottom: 4 }} selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
