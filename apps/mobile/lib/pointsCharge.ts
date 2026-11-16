import type {
  PointsChargePrice,
  PointsChargePurchaseStatus,
  PointsChargeRestoreStatus,
} from "@focusmakers/types";
import * as SecureStore from "expo-secure-store";

/**
 * 결제 SDK 어댑터
 *
 * `start`는 결제 SDK를 그 결제용 ID의 사용자로 켜고, 켜기 전의 결제 SDK는 RevenueCat에 아무것도 보내지 않는다.
 * `logIn`은 이미 켠 결제 SDK의 사용자를 다른 결제용 ID로 바꾼다.
 * `purchase`는 결제가 끝나면 true, 사용자가 결제 창을 닫았으면 false를 돌려주고 그 밖의 실패는 throw한다.
 * `restore`는 스토어 결제 기록을 결제 SDK에 다시 맞춘 뒤 그 기록에 있는 스토어 상품 ID를 돌려준다.
 */
export type PointsChargeAdapter = {
  start(appUserId: string): void;
  logIn(appUserId: string): Promise<void>;
  prices(storeProductIds: string[]): Promise<PointsChargePrice[]>;
  purchase(storeProductId: string): Promise<boolean>;
  restore(): Promise<string[]>;
};

// 결제용 ID는 계정을 가리키는 값이라 iCloud 키체인으로 다른 기기에 복사되지 않게 이 기기에만 둔다.
const RECORD_KEY = "focuson.pointsCharge";
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

let adapter: PointsChargeAdapter | null = null;
let inFlight = false;
/** 결제 SDK에 로그인해 둔 결제용 ID이며 아직 켜지 않았으면 null이다. */
let signedIn: string | null = null;
/** 앱 저장소에 남긴 결제용 ID이며 같은 값을 다시 쓰지 않으려고 기억한다. */
let remembered: string | null = null;

export function setPointsChargeAdapter(next: PointsChargeAdapter): void {
  adapter = next;
}

/**
 * 테스트 전용 어댑터·진행 중 표시 초기화
 *
 * 프로덕션 코드에서는 호출하지 않는다.
 */
export function __resetPointsChargeForTests(): void {
  adapter = null;
  inFlight = false;
  signedIn = null;
  remembered = null;
}

/**
 * 결제 SDK를 그 결제용 ID로 켜거나 사용자를 바꾸기
 *
 * 앱을 켤 때가 아니라 결제용 ID가 실린 첫 결제 메시지에서 켜서, 결제하지 않는 사람과 비회원의 기기 정보가 RevenueCat으로 가지 않게 한다.
 * 켠 기기는 결제용 ID를 앱 저장소에 남겨 다음 시작에 바로 켜고, 끊긴 결제를 결제 SDK가 이어서 처리하게 한다.
 * 기록을 남기지 못해도 이번 결제는 막지 않는다.
 */
async function signIn(active: PointsChargeAdapter, appUserId: string): Promise<void> {
  if (signedIn === null) {
    active.start(appUserId);
  } else if (signedIn !== appUserId) {
    await active.logIn(appUserId);
  }
  signedIn = appUserId;
  if (remembered !== appUserId) {
    remembered = appUserId;
    await SecureStore.setItemAsync(RECORD_KEY, appUserId, STORE_OPTIONS).catch((error: unknown) => {
      remembered = null;
      console.warn("[points-charge] 켠 기록 저장 실패", error);
    });
  }
}

/**
 * 앱을 시작할 때 지난번에 켠 결제 SDK를 다시 켜기
 *
 * 결제 창이 떠 있는 동안 앱이 끝나면 스토어 결제가 결제 SDK에 넘어가지 못한 채 남는다.
 * 지난번에 켠 기록이 있는 기기만 그 결제용 ID로 바로 켜서 결제 SDK가 남은 결제를 서버에 넘기게 한다.
 * 기록을 읽는 동안 웹의 결제 메시지가 먼저 켰으면 다시 켜지 않는다.
 */
export async function resumePointsCharge(): Promise<void> {
  if (adapter === null) {
    return;
  }
  const stored = await SecureStore.getItemAsync(RECORD_KEY, STORE_OPTIONS).catch(() => null);
  if (!stored || signedIn !== null) {
    return;
  }
  remembered = stored;
  try {
    adapter.start(stored);
    signedIn = stored;
  } catch (error) {
    console.warn("[points-charge] 시작할 때 결제 SDK를 켜지 못함", error);
  }
}

/**
 * 로그아웃·탈퇴 뒤 켠 기록 삭제
 *
 * 다음 시작에 이전 계정의 결제용 ID로 결제 SDK를 켜지 않게 한다.
 * 지금 켜져 있는 결제 SDK는 다음 결제 메시지가 새 결제용 ID로 로그인해 바꾼다.
 * 실패해도 throw 하지 않는다.
 */
export async function forgetPointsChargeUser(): Promise<void> {
  remembered = null;
  await SecureStore.deleteItemAsync(RECORD_KEY, STORE_OPTIONS).catch((error: unknown) => {
    console.warn("[points-charge] 켠 기록 삭제 실패", error);
  });
}

/** 이 바이너리가 포인트 충전 결제를 할 수 있는지 여부 */
export function isPointsChargeSupported(): boolean {
  return adapter !== null;
}

/**
 * 스토어의 충전 상품 가격 조회
 *
 * 가격과 통화는 스토어가 정하므로 서버가 아니라 결제 SDK에서 읽는다.
 * 결제 SDK는 결제용 ID로 켜므로 결제용 ID가 없는 비회원의 조회에는 켜지 않고 빈 목록으로 답한다.
 * 이미 켠 결제 SDK의 사용자를 바꾸지 못해도 가격은 돈이 오가지 않아 그대로 묻는다.
 * 실패하면 빈 목록을 돌려줘서 웹이 가격 없는 상품을 팔지 않게 한다.
 */
export async function pointsChargePrices(
  storeProductIds: string[],
  appUserId: string | null,
): Promise<PointsChargePrice[]> {
  if (adapter === null || storeProductIds.length === 0 || appUserId === null) {
    return [];
  }
  await signIn(adapter, appUserId).catch((error: unknown) => {
    console.warn("[points-charge] 가격 조회 전 로그인 실패", error);
  });
  if (signedIn === null) {
    return [];
  }
  try {
    return await adapter.prices(storeProductIds);
  } catch (error) {
    console.warn("[points-charge] 가격 조회 실패", error);
    return [];
  }
}

/**
 * 포인트 충전 결제
 *
 * 서버는 결제 알림에 실린 결제용 ID로 포인트를 줄 계정을 찾으므로, 결제 전에 웹이 넘긴 결제용 ID로 결제 SDK를 켜거나 로그인한다.
 * 결제용 ID는 서버의 충전 상품 목록이 회원에게만 주는 값이고 회원번호와 다르다.
 * 회원번호로 로그인한 결제는 서버가 지급하지 않으므로 결제용 ID가 없으면 회원번호로 대신하지 않고 결제하지 않는다.
 * 로그인에 실패해도 결제하지 않는다. 주인을 모르는 결제는 돈만 나가고 포인트가 들어오지 않는다.
 * 결제 창이 떠 있는 동안 온 두 번째 요청은 취소로 답한다.
 */
export async function purchasePointsCharge(
  storeProductId: string,
  appUserId: string | null,
): Promise<PointsChargePurchaseStatus> {
  if (adapter === null || appUserId === null) {
    return "failed";
  }
  if (inFlight) {
    return "cancelled";
  }
  inFlight = true;
  try {
    await signIn(adapter, appUserId);
    return (await adapter.purchase(storeProductId)) ? "completed" : "cancelled";
  } catch (error) {
    console.warn("[points-charge] 결제 실패", error);
    return "failed";
  } finally {
    inFlight = false;
  }
}

/**
 * 구매 복원
 *
 * 결제로 산 상품이 새 기기나 다시 설치한 앱에서 보이지 않을 때 스토어 결제 기록으로 되찾는다.
 * 서버는 결제 알림에 실린 결제용 ID로 보유를 바꾸므로, 결제와 같은 결제용 ID로 로그인한 뒤에 복원한다.
 * 결제 기록에는 충전 묶음도 남아서, 웹이 넘긴 상품이 그 안에 있을 때만 되찾았다고 답한다.
 * 결제나 다른 복원이 진행 중이면 실패로 답한다.
 */
export async function restorePointsPurchases(
  storeProductIds: string[],
  appUserId: string | null,
): Promise<PointsChargeRestoreStatus> {
  if (adapter === null || appUserId === null || inFlight) {
    return "failed";
  }
  inFlight = true;
  try {
    await signIn(adapter, appUserId);
    const purchased = new Set(await adapter.restore());
    return storeProductIds.some((id) => purchased.has(id)) ? "restored" : "nothing";
  } catch (error) {
    console.warn("[points-charge] 구매 복원 실패", error);
    return "failed";
  } finally {
    inFlight = false;
  }
}
