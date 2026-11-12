import Constants from "expo-constants";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * 결제·광고 SDK 실기기 스파이크 화면
 *
 * 본 구현에 들어가지 않는 실험용 화면이다.
 * SDK는 버튼을 누를 때 require해서, 네이티브 모듈이 없는 이전 Dev Client에서도 이 화면 밖은 영향을 받지 않는다.
 * 광고는 Google이 주는 테스트 광고 단위만 쓴다.
 */
export default function SpikeMonetizationScreen() {
  const insets = useSafeAreaInsets();
  const [lines, setLines] = useState<string[]>([]);
  const purchasesConfigured = useRef(false);

  const log = useCallback((message: string) => {
    const stamp = new Date().toISOString().slice(11, 23);
    setLines((prev) => [`${stamp} ${message}`, ...prev].slice(0, 80));
  }, []);

  const run = useCallback(
    (label: string, task: () => Promise<void>) => () => {
      log(`▶ ${label}`);
      task().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : JSON.stringify(error);
        log(`✗ ${label}: ${detail}`);
      });
    },
    [log],
  );

  const showRewarded = run("보상형 테스트 광고", async () => {
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
    rewarded.addAdEventListener(ads.AdEventType.ERROR, (error) =>
      log(`광고 오류 ${error.message}`),
    );
    rewarded.load();
  });

  const loadPurchases = useCallback(async () => {
    const purchases = (require("react-native-purchases") as typeof import("react-native-purchases"))
      .default;
    if (!purchasesConfigured.current) {
      const apiKey = Constants.expoConfig?.extra?.revenueCatApiKey as string | undefined;
      if (!apiKey) throw new Error("REVENUECAT_API_KEY가 .env.local에 없어요");
      purchases.configure({ apiKey, appUserID: "spike-user" });
      purchasesConfigured.current = true;
      log("RevenueCat 설정 완료");
    }
    return purchases;
  }, [log]);

  const listOfferings = run("상품 목록", async () => {
    const purchases = await loadPurchases();
    const offerings = await purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    log(`현재 offering: ${offerings.current?.identifier ?? "없음"}, 상품 ${packages.length}개`);
    for (const item of packages) {
      log(`· ${item.identifier} ${item.product.identifier} ${item.product.priceString}`);
    }
  });

  const buyFirst = run("첫 상품 결제", async () => {
    const purchases = await loadPurchases();
    const offerings = await purchases.getOfferings();
    const target = offerings.current?.availablePackages[0];
    if (!target) throw new Error("살 수 있는 상품이 없어요");
    const result = await purchases.purchasePackage(target);
    log(`결제 완료 ${result.productIdentifier}`);
    log(`거래 ${JSON.stringify(result.customerInfo.nonSubscriptionTransactions.slice(-1))}`);
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top + 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", paddingHorizontal: 16 }}>
        결제·광고 스파이크
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 }}>
        <SpikeButton label="보상형 광고 보기" onPress={showRewarded} />
        <SpikeButton label="상품 목록" onPress={listOfferings} />
        <SpikeButton label="첫 상품 결제" onPress={buyFirst} />
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

function SpikeButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
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
      <Text style={{ color: "#fff", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
