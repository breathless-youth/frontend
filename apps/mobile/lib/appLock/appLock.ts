import { colors } from "@focusmakers/design-tokens";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { getRnda, type RndaApi } from "./rnda";

export type AppLockState = {
  supported: boolean;
  authorized: boolean;
  revoked: boolean;
  appCount: number;
  categoryCount: number;
};

export const SELECTION_ID = "focusmakers_app_lock";
export const ACTIVITY_NAME = "focusmakers_study_lock";
export const SAFETY_RELEASE_HOURS = 12;

const APPROVED_STATUS = 2;
// react-native-device-activity가 선택을 id별로 담아 두는 App Group 키다.
const SELECTION_IDS_KEY = "familyActivitySelectionIds";
const APPROVED_BEFORE_KEY = "appLock.approvedBefore";
// 백업으로 다른 기기에 복사되면 그 기기에서 권한을 끈 것으로 잘못 읽는다.
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const SELECTION = { activitySelectionId: SELECTION_ID };
const SHIELD = {
  title: "지금은 공부에 집중하고,\n쉴 땐 확실히 쉬자고요:)",
  subtitle: "공부가 끝나면 다시 열려요",
  primaryButtonLabel: "닫기",
  iconSystemName: "lock.fill",
  // Shield는 RGB 값 하나만 받아 다크 모드를 따라가지 못해서 라이트 값을 쓴다.
  iconTint: hexToRgb(colors.brand.primary.light),
};

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  return { red: channel(1), green: channel(3), blue: channel(5) };
}

const UNSUPPORTED: AppLockState = {
  supported: false,
  authorized: false,
  revoked: false,
  appCount: 0,
  categoryCount: 0,
};

/** 스크린타임 확장이 iOS 18 이상으로 만들어져 그 아래에서는 안전 해제 예약이 돌지 않는다. */
function supportedRnda(): RndaApi | null {
  if (Platform.OS !== "ios" || parseInt(String(Platform.Version), 10) < 18) {
    return null;
  }
  return getRnda();
}

export function isAppLockSupported(): boolean {
  return supportedRnda() !== null;
}

/** 잠금 실패가 공부 측정을 막으면 안 되어서 RNDA 호출은 전부 경고만 남기고 넘어간다. */
function safely(label: string, call: () => void): boolean {
  try {
    call();
    return true;
  } catch (error) {
    console.warn(`[appLock] ${label} 실패`, error);
    return false;
  }
}

function selectionCounts(rnda: RndaApi): { appCount: number; categoryCount: number } {
  try {
    const meta = rnda.activitySelectionMetadata(SELECTION);
    return { appCount: meta?.applicationCount ?? 0, categoryCount: meta?.categoryCount ?? 0 };
  } catch (error) {
    console.warn("[appLock] 선택 개수 읽기 실패", error);
    return { appCount: 0, categoryCount: 0 };
  }
}

async function readApprovedBefore(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(APPROVED_BEFORE_KEY, STORE_OPTIONS)) === "1";
  } catch {
    return false;
  }
}

/**
 * 방해 앱 잠금 상태 조회
 *
 * 설정에서 권한을 끄면 iOS는 거부가 아니라 미결정으로 되돌려서,
 * 처음 허용받을 때 남긴 기록으로 "껐다"와 "처음이다"를 판단한다.
 */
export async function getAppLockState(): Promise<AppLockState> {
  const rnda = supportedRnda();
  if (rnda === null) {
    return UNSUPPORTED;
  }
  const authorized = rnda.getAuthorizationStatus() === APPROVED_STATUS;
  const approvedBefore = await readApprovedBefore();
  if (authorized && !approvedBefore) {
    await SecureStore.setItemAsync(APPROVED_BEFORE_KEY, "1", STORE_OPTIONS).catch(() => undefined);
  }
  return {
    supported: true,
    authorized,
    revoked: approvedBefore && !authorized,
    ...selectionCounts(rnda),
  };
}

export async function authorizeAppLock(): Promise<AppLockState> {
  const rnda = supportedRnda();
  if (rnda === null || rnda.getAuthorizationStatus() === APPROVED_STATUS) {
    return getAppLockState();
  }
  try {
    await rnda.requestAuthorization("individual");
  } catch {
    // 거부도 예외로 오므로 결과는 아래 상태 조회로 읽는다.
  }
  return getAppLockState();
}

/**
 * 고른 앱 저장
 *
 * `null`은 사용자가 전부 지운 것이라 저장된 선택을 없앤다.
 * 라이브러리에 지우는 함수가 없어서, 라이브러리가 빈 선택을 지울 때와 같이 id 사전에서 이 id만 뺀다.
 */
export async function saveSelection(selection: string | null): Promise<AppLockState> {
  const rnda = supportedRnda();
  if (rnda !== null) {
    if (selection === null) {
      safely("선택 지우기", () => {
        const { [SELECTION_ID]: _removed, ...rest } =
          rnda.userDefaultsGet<Record<string, string>>(SELECTION_IDS_KEY) ?? {};
        rnda.userDefaultsSet(SELECTION_IDS_KEY, rest);
      });
    } else {
      safely("선택 저장", () =>
        rnda.setFamilyActivitySelectionId({ id: SELECTION_ID, familyActivitySelection: selection }),
      );
    }
  }
  return getAppLockState();
}

/**
 * 안전 해제 예약
 *
 * 앱이 강제 종료돼도 확장이 이 예약 끝에 잠금을 푼다.
 * 시각만 주는 일회성 예약이라 끝이 시작보다 이르면 다음 날로 넘어간다.
 */
export function safetyReleaseSchedule(now: Date) {
  const end = new Date(now.getTime() + SAFETY_RELEASE_HOURS * 3_600_000);
  const clock = (d: Date) => ({
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  });
  return { intervalStart: clock(now), intervalEnd: clock(end), repeats: false as const };
}

/**
 * 공부 시작 잠금
 *
 * 잠근 뒤 예약을 걸면 그 사이에 앱이 죽었을 때 풀어 줄 방법 없이 잠금만 남아서 예약을 먼저 건다.
 * 예약이 실패하면 잠그지 않는다.
 * 공부 중에 고른 앱이 바뀌어도 걸어 둔 잠금이 남지 않게 안전 해제는 선택 기준이 아니라 전부 푼다.
 */
export async function startStudyLock(
  now: Date = new Date(),
): Promise<{ appCount: number; categoryCount: number } | null> {
  const rnda = supportedRnda();
  if (rnda === null || rnda.getAuthorizationStatus() !== APPROVED_STATUS) {
    return null;
  }
  const counts = selectionCounts(rnda);
  if (counts.appCount + counts.categoryCount === 0) {
    return null;
  }
  try {
    rnda.configureActions({
      activityName: ACTIVITY_NAME,
      callbackName: "intervalDidEnd",
      actions: [{ type: "resetBlocks" }],
    });
    await rnda.startMonitoring(ACTIVITY_NAME, safetyReleaseSchedule(now), []);
    rnda.updateShield(SHIELD, { primary: { behavior: "close" } });
    rnda.blockSelection(SELECTION, "study-start");
  } catch (error) {
    console.warn("[appLock] 잠금 실패", error);
    return null;
  }
  return counts;
}

/**
 * 공부 끝 잠금 해제
 *
 * 공부 중에 고른 앱이 바뀌면 선택 기준으로 풀 때 옛 앱이 잠긴 채 남아서 걸린 잠금을 전부 푼다.
 * 이 앱이 거는 잠금은 공부 잠금 하나뿐이라 전부 풀어도 다른 잠금을 건드리지 않는다.
 * 풀기에 실패했는데 예약까지 지우면 잠금을 풀어 줄 길이 없어져서, 예약은 풀린 뒤에만 지운다.
 */
export async function stopStudyLock(): Promise<void> {
  const rnda = supportedRnda();
  if (rnda === null) {
    return;
  }
  if (safely("잠금 해제", () => rnda.resetBlocks("study-end"))) {
    safely("예약 해제", () => rnda.stopMonitoring([ACTIVITY_NAME]));
  }
}

/**
 * 실행 시 정리
 *
 * 새 프로세스에는 진행 중인 공부가 없어서 웹에 묻지 않고 남은 잠금과 예약을 지운다.
 * 백그라운드에서 돌아올 때는 일시정지 중인 공부가 살아 있으므로 부르지 않는다.
 * 풀기에 실패하면 예약을 남겨 확장이 풀게 둔다.
 */
export async function cleanupOnLaunch(): Promise<void> {
  const rnda = supportedRnda();
  if (rnda === null) {
    return;
  }
  if (safely("실행 시 잠금 정리", () => rnda.resetBlocks("launch-cleanup"))) {
    safely("실행 시 예약 정리", () => rnda.stopMonitoring([ACTIVITY_NAME]));
  }
}
