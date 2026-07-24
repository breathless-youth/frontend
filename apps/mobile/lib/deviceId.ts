import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "focuson.deviceId";

/**
 * 기기 식별 UUID를 SecureStore에서 조회하고, 없으면 생성해 저장한다.
 * 앱 삭제 시 UUID가 사라지면 기존 데이터와 재연결 불가 — 익명 계정 방식의
 * 알려진 한계 (스펙 참고).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const deviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
