import { requireOptionalNativeModule } from "expo-modules-core";

export type LaunchableApp = {
  packageName: string;
  label: string;
  /** 96px PNG를 base64로 담은 값 */
  iconBase64: string;
};

export interface AppLockNative {
  hasUsageAccess(): boolean;
  canDrawOverlays(): boolean;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  /** 이 앱의 앱 정보 화면을 열고, 없는 기기면 배터리 최적화 목록 화면을 연다. */
  openAppBatterySettings(): void;
  getLaunchableApps(): Promise<LaunchableApp[]>;
  getSelectedPackages(): string[];
  setSelectedPackages(packages: string[]): void;
  /** 고른 앱이 있으면 잠금 서비스를 시작하고 잠근 앱 개수를 돌려준다. 고른 앱이 없으면 0이다. */
  startLock(durationMs: number): number;
  stopLock(): void;
}

/**
 * Android 방해 앱 잠금 모듈
 *
 * iOS와 Jest, 이 모듈이 없는 옛 Dev Client에서는 null이라 부르는 쪽이 지원하지 않는 기기로 처리한다.
 * 앱 이름과 아이콘은 고르기 화면에서만 쓰고 웹 브리지에는 싣지 않는다.
 */
export const appLockNative = requireOptionalNativeModule<AppLockNative>("AppLock");
