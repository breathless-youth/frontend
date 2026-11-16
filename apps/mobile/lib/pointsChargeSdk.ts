import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import type * as PurchasesSdk from "react-native-purchases";

import { setPointsChargeAdapter } from "./pointsCharge";

type PurchasesModule = typeof PurchasesSdk;

/**
 * RevenueCat 결제 SDK 실구현 어댑터
 *
 * 이 파일만 SDK를 불러오고 다른 코드는 `lib/pointsCharge.ts`의 공개 함수만 본다.
 * `app/_layout.tsx`가 모듈 스코프에서 `installPointsChargeSdk()`를 부른다.
 * 앱을 켤 때는 어댑터만 붙이고, SDK는 `lib/pointsCharge.ts`가 결제용 ID를 받았을 때 그 ID로 시작한다.
 * 결제용 ID를 넘겨 시작하면 SDK가 익명 사용자를 따로 만들지 않는다.
 * 운영 공개 키가 플랫폼마다 달라서 실행 중인 플랫폼의 키로 SDK를 시작한다.
 * 그 키가 없는 빌드는 SDK를 불러오지 않는다.
 * Metro의 새 JS가 SDK 네이티브 모듈(`RNPurchases`)이 없는 이전 Dev Client에 실리면 시작할 때 실패하므로 미리 확인해 충전을 끈다.
 * 포인트는 소모성 상품이라 구독이 아닌 상품으로 조회한다.
 */
export function installPointsChargeSdk(): void {
  const apiKeys = Constants.expoConfig?.extra?.revenueCatApiKeys as
    Partial<Record<string, string>> | undefined;
  const apiKey = apiKeys?.[Platform.OS];
  if (!apiKey) {
    return;
  }
  if (!NativeModules.RNPurchases) {
    console.warn("[points-charge] 결제 SDK 네이티브 모듈이 없어 충전을 끈다");
    return;
  }
  let sdk: PurchasesModule["default"];
  let category: PurchasesModule["PRODUCT_CATEGORY"];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("react-native-purchases") as PurchasesModule;
    sdk = loaded.default;
    category = loaded.PRODUCT_CATEGORY;
  } catch (error) {
    console.warn("[points-charge] 결제 SDK를 불러오지 못해 충전을 끈다", error);
    return;
  }
  const load = (storeProductIds: string[]) =>
    sdk.getProducts(storeProductIds, category.NON_SUBSCRIPTION);
  setPointsChargeAdapter({
    start(appUserId) {
      sdk.configure({ apiKey, appUserID: appUserId });
    },
    async logIn(appUserId) {
      await sdk.logIn(appUserId);
    },
    async prices(storeProductIds) {
      const products = await load(storeProductIds);
      return products.map((product) => ({
        storeProductId: product.identifier,
        priceLabel: product.priceString,
      }));
    },
    async purchase(storeProductId) {
      const product = (await load([storeProductId])).find(
        (candidate) => candidate.identifier === storeProductId,
      );
      if (product === undefined) {
        throw new Error(`스토어에 없는 상품: ${storeProductId}`);
      }
      try {
        await sdk.purchaseStoreProduct(product);
        return true;
      } catch (error) {
        if ((error as { userCancelled?: boolean | null }).userCancelled === true) {
          return false;
        }
        throw error;
      }
    },
    async restore() {
      const info = await sdk.restorePurchases();
      return info.nonSubscriptionTransactions.map((transaction) => transaction.productIdentifier);
    },
  });
}
