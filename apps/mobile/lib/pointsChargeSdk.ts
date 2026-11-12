import Constants from "expo-constants";
import type * as PurchasesSdk from "react-native-purchases";

import { setPointsChargeAdapter } from "./pointsCharge";

type PurchasesModule = typeof PurchasesSdk;

/**
 * RevenueCat 결제 SDK 실구현 어댑터
 *
 * 이 파일만 SDK를 불러오고 다른 코드는 `lib/pointsCharge.ts`의 공개 함수만 본다.
 * `app/_layout.tsx`가 모듈 스코프에서 `installPointsChargeSdk()`를 부른다.
 * 키가 없는 빌드는 SDK를 불러오지 않고, Metro의 새 JS가 SDK 네이티브 모듈이 없는 이전 Dev Client에 실리면 충전을 끈다.
 * 포인트는 소모성 상품이라 구독이 아닌 상품으로 조회한다.
 */
export function installPointsChargeSdk(): void {
  const apiKey = Constants.expoConfig?.extra?.revenueCatApiKey as string | undefined;
  if (!apiKey) {
    return;
  }
  let sdk: PurchasesModule["default"];
  let category: PurchasesModule["PRODUCT_CATEGORY"];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("react-native-purchases") as PurchasesModule;
    sdk = loaded.default;
    category = loaded.PRODUCT_CATEGORY;
    sdk.configure({ apiKey });
  } catch (error) {
    console.warn("[points-charge] 결제 SDK를 불러오지 못해 충전을 끈다", error);
    return;
  }
  const load = (storeProductIds: string[]) =>
    sdk.getProducts(storeProductIds, category.NON_SUBSCRIPTION);
  setPointsChargeAdapter({
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
  });
}
