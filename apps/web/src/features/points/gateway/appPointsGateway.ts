import { POINTS_SCENES, type PointsScene } from "../pointsScenes";
import { createApiPointsGateway } from "./createApiPointsGateway";
import { FULL_POINTS_CAPABILITIES, type PointsGateway } from "./PointsGateway";

// 앱 안에서 이동하면 주소에서 쿼리가 빠지므로 처음 고른 경계를 문서가 끝날 때까지 쓴다.
let cached: PointsGateway | null = null;

function readMockScene(): PointsScene | null {
  const value = new URLSearchParams(window.location.search).get("pointsMock");
  return POINTS_SCENES.find((scene) => scene === value) ?? null;
}

/**
 * 고정 데이터를 처음 부를 때 불러오는 가짜 경계
 *
 * 화면이 capabilities를 바로 읽어야 해서 메서드만 불러온 가짜에 넘긴다.
 */
function deferredFakeGateway(scene: PointsScene): PointsGateway {
  let loading: Promise<PointsGateway> | null = null;
  const load = () =>
    (loading ??= import("./createFakePointsGateway").then((mod) =>
      mod.createFakePointsGateway(scene),
    ));
  return {
    capabilities: FULL_POINTS_CAPABILITIES,
    getBalance: async () => (await load()).getBalance(),
    getShop: async () => (await load()).getShop(),
    purchase: async (itemId) => (await load()).purchase(itemId),
    equipAccessory: async (mascotId, slot, itemId) =>
      (await load()).equipAccessory(mascotId, slot, itemId),
    setTimerBackground: async (itemId) => (await load()).setTimerBackground(itemId),
    selectMascot: async (id) => (await load()).selectMascot(id),
    markUnlocksSeen: async () => (await load()).markUnlocksSeen(),
    getSessionReward: async (startedAt) => (await load()).getSessionReward(startedAt),
    getHistory: async (filter, cursor) => (await load()).getHistory(filter, cursor),
    getEarnToday: async () => (await load()).getEarnToday(),
    claim: async (kind) => (await load()).claim(kind),
    watchAd: async () => (await load()).watchAd(),
    getChargePacks: async () => (await load()).getChargePacks(),
    charge: async (productId) => (await load()).charge(productId),
  };
}

/**
 * 포인트 화면 입구와 홈·설정이 함께 쓰는 경계
 *
 * 기본은 실제 API이고, 개발 빌드에서만 주소에 `pointsMock=<장면>`이 있으면 메모리 가짜를 쓴다.
 * `import.meta.env.DEV`가 거짓인 운영 빌드에서는 가짜 분기와 동적 import가 통째로 빠져 고정 데이터가 번들에 들어가지 않는다.
 * 상점·홈·설정이 같은 잔액을 보도록 문서마다 하나만 만든다.
 */
export function appPointsGateway(): PointsGateway {
  if (cached !== null) {
    return cached;
  }
  if (import.meta.env.DEV) {
    const scene = readMockScene();
    if (scene !== null) {
      cached = deferredFakeGateway(scene);
      return cached;
    }
  }
  cached = createApiPointsGateway();
  return cached;
}

/** 테스트마다 주소를 바꿔 경계를 다시 고르도록 기억한 경계를 비운다. */
export function __resetAppPointsGatewayForTests(): void {
  cached = null;
}
