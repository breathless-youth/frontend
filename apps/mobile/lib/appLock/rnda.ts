import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type * as RNDA from "react-native-device-activity";

/**
 * react-native-device-activity 어댑터
 *
 * 라이브러리 최근 업데이트(26.02)
 * - 추후 로컬 모듈로 바꿀 때 이 파일만 고치면 된다.
 * - 선택 화면 컴포넌트는 모듈 평가 때 네이티브 뷰를 찾으므로, 네이티브 모듈이 있는 iOS 빌드에서만 require한다.
 */
export type RndaApi = Pick<
  typeof RNDA,
  | "getAuthorizationStatus"
  | "requestAuthorization"
  | "setFamilyActivitySelectionId"
  | "getFamilyActivitySelectionId"
  | "userDefaultsGet"
  | "userDefaultsSet"
  | "activitySelectionMetadata"
  | "blockSelection"
  | "resetBlocks"
  | "updateShield"
  | "configureActions"
  | "startMonitoring"
  | "stopMonitoring"
  | "DeviceActivitySelectionView"
>;

/** `undefined`는 아직 확인 전, `null`은 쓸 수 없는 빌드다. */
let cached: RndaApi | null | undefined;

export function getRnda(): RndaApi | null {
  if (cached === undefined) {
    cached =
      Platform.OS === "ios" && requireOptionalNativeModule("ReactNativeDeviceActivity") !== null
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- 네이티브 모듈을 확인한 뒤에만 동기로 불러온다.
          (require("react-native-device-activity") as RndaApi)
        : null;
  }
  return cached;
}
