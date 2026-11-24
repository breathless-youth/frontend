import type { ShopItemResponse } from "@/features/points/gateway/pointsApiTypes";
import type { SpaceSelection } from "@/features/timer-background/timerBackground";

/** 공간 테스트가 함께 쓰는 서버 상품 한 줄. 기본값은 다이나믹 분류에 든 가진 무료 독서실 감독관이다. */
export function shopSpace(overrides: Partial<ShopItemResponse> = {}): ShopItemResponse {
  return {
    id: 41,
    code: "SPACE_PROCTOR",
    category: "TIMER_BACKGROUND",
    mascotCode: null,
    slot: null,
    name: "독서실 감독관",
    imageUrl: null,
    price: null,
    owned: true,
    inUse: false,
    unlock: null,
    storeProductId: null,
    assetKey: "watcher/9c8d9f19",
    assetType: "VIDEO",
    videoMode: "WATCH",
    // 다른 상품을 만들 때 감독관의 분류가 따라가지 않게 한다
    tags: overrides.code === undefined ? [{ code: "DYNAMIC", name: "다이나믹" }] : [],
    ...overrides,
  };
}

/** `shopSpace()` 기본값을 고른 선택 값 */
export const PROCTOR_SPACE: SpaceSelection = {
  kind: "space",
  itemId: 41,
  code: "SPACE_PROCTOR",
  assetKey: "watcher/9c8d9f19",
  assetType: "VIDEO",
  videoMode: "WATCH",
};

/** 자연 분류가 붙은 반복 영상 공간 */
export const RAIN_ITEM = shopSpace({
  id: 42,
  code: "SPACE_RAIN",
  name: "비 오는 창가",
  assetKey: "loop/1a2b3c4d",
  videoMode: "LOOP",
  tags: [{ code: "NATURE", name: "자연" }],
});

export const RAIN_SPACE: SpaceSelection = {
  kind: "space",
  itemId: 42,
  code: "SPACE_RAIN",
  assetKey: "loop/1a2b3c4d",
  assetType: "VIDEO",
  videoMode: "LOOP",
};
