import type { PointsAdStatus } from "@focusmakers/types";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type * as MobileAdsSdk from "react-native-google-mobile-ads";

import { setPointsAdsAdapter } from "./pointsAds";

type MobileAdsModule = typeof MobileAdsSdk;

/** 광고를 불러오는 데 이보다 오래 걸리면 볼 수 있는 광고가 없는 것으로 본다. */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Google Mobile Ads 보상형 광고 실구현 어댑터
 *
 * 이 파일만 SDK를 불러오고 다른 코드는 `lib/pointsAds.ts`의 공개 함수만 본다.
 * `app/_layout.tsx`가 모듈 스코프에서 `installPointsAdsSdk()`를 부른다.
 * 광고 단위 ID가 없는 빌드는 SDK를 불러오지 않고, Metro의 새 JS가 SDK 네이티브 모듈이 없는 이전 Dev Client에 실리면 광고를 끈다.
 * 미성년 사용자가 많아 광고 등급 상한을 전체 이용가로 건다.
 * 맞춤 광고는 허용하기로 해서 맞춤 광고를 끄는 옵션과 아동 대상 표시는 넣지 않는다.
 */
export function installPointsAdsSdk(): void {
  const unitIds = Constants.expoConfig?.extra?.admobRewardedUnitIds as
    Partial<Record<string, string>> | undefined;
  const unitId = unitIds?.[Platform.OS];
  if (!unitId) {
    return;
  }
  let ads: MobileAdsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ads = require("react-native-google-mobile-ads") as MobileAdsModule;
    // 네이티브 모듈이 없으면 여기서 throw한다.
    ads.default();
  } catch (error) {
    console.warn("[points-ads] 광고 SDK를 불러오지 못해 광고를 끈다", error);
    return;
  }
  let initialized: Promise<unknown> | null = null;
  // 등급 상한은 SDK를 시작하기 전에 걸어야 첫 광고부터 전체 이용가 광고만 온다.
  const start = () =>
    ads
      .default()
      .setRequestConfiguration({ maxAdContentRating: ads.MaxAdContentRating.G })
      .then(() => ads.default().initialize());
  setPointsAdsAdapter({
    async show(userId) {
      initialized ??= start();
      await initialized;
      const rewarded = ads.RewardedAd.createForAdRequest(unitId, {
        serverSideVerificationOptions: { userId },
      });
      return new Promise<PointsAdStatus>((resolve) => {
        let earned = false;
        const finish = (status: PointsAdStatus) => {
          clearTimeout(timer);
          rewarded.removeAllListeners();
          resolve(status);
        };
        const timer = setTimeout(() => finish("unavailable"), LOAD_TIMEOUT_MS);
        rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
          clearTimeout(timer);
          void rewarded.show().catch((error: unknown) => {
            console.warn("[points-ads] 광고 표시 실패", error);
            finish("unavailable");
          });
        });
        rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        });
        rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
          finish(earned ? "rewarded" : "cancelled");
        });
        rewarded.addAdEventListener(ads.AdEventType.ERROR, (error) => {
          console.warn("[points-ads] 광고 오류", error);
          finish("unavailable");
        });
        rewarded.load();
      });
    },
  });
}
