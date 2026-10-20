import { colors } from "@focusmakers/design-tokens";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { type AppLockNative, appLockNative } from "../../modules/app-lock";
import { offerBatteryGuide, requestConsent } from "./androidFlow";
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
export const SAFETY_RELEASE_HOURS = 6;

const APPROVED_STATUS = 2;
// react-native-device-activity가 선택을 id별로 담아 두는 App Group 키다.
const SELECTION_IDS_KEY = "familyActivitySelectionIds";
const APPROVED_BEFORE_KEY = "appLock.approvedBefore";
// 백업으로 다른 기기에 복사되면 그 기기에서 권한을 끈 것으로 잘못 읽는다.
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const SELECTION = { activitySelectionId: SELECTION_ID };
const SHIELD = {
  title: "지금은 공부에 집중하는 시간이에요",
  // 앱을 강제 종료한 사람은 공부가 끝났다고 여겨 "공부가 끝나면"으로는 우리 앱을 다시 열어야 풀린다는 걸 모른다.
  subtitle: "포커스 메이커스 앱에서 공부를 끝내면 잠금이 풀려요",
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

/** 다른 앱 위에 띄우는 잠금 화면의 창 종류가 Android 8(API 26)부터 있다. */
function supportedAndroid(): AppLockNative | null {
  if (Platform.OS !== "android" || Number(Platform.Version) < 26) {
    return null;
  }
  return appLockNative;
}

export function isAppLockSupported(): boolean {
  return supportedRnda() !== null || supportedAndroid() !== null;
}

/** 상태를 읽지 못했을 때 웹에 답할 잠글 수 없는 상태 */
export function fallbackAppLockState(): AppLockState {
  return { ...UNSUPPORTED, supported: isAppLockSupported() };
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

type Counts = { appCount: number; categoryCount: number };

function selectionCounts(read: () => Counts): Counts {
  try {
    return read();
  } catch (error) {
    console.warn("[appLock] 선택 개수 읽기 실패", error);
    return { appCount: 0, categoryCount: 0 };
  }
}

// 던지면 조회·권한 요청이 웹에 답하지 못해 웹이 시간 제한까지 기다려서 허용 안 됨으로 읽는다.
// 읽기 실패를 허용 안 됨과 같은 false로 돌려주면 일시적인 실패가 권한을 끈 것으로 읽혀 웹이 기능을 꺼서 null로 따로 돌려준다.
function readAuthorized(read: () => boolean): boolean | null {
  try {
    return read();
  } catch (error) {
    console.warn("[appLock] 권한 상태 읽기 실패", error);
    return null;
  }
}

function androidAuthorized(native: AppLockNative): boolean {
  return native.hasUsageAccess() && native.canDrawOverlays();
}

/** iOS는 스크린타임 권한 하나, Android는 사용정보 접근과 다른 앱 위에 표시 둘 다 있어야 잠글 수 있다. */
function lockReader(): { authorized: () => boolean; counts: () => Counts } | null {
  const rnda = supportedRnda();
  if (rnda !== null) {
    return {
      authorized: () => rnda.getAuthorizationStatus() === APPROVED_STATUS,
      counts: () => {
        const meta = rnda.activitySelectionMetadata(SELECTION);
        return { appCount: meta?.applicationCount ?? 0, categoryCount: meta?.categoryCount ?? 0 };
      },
    };
  }
  const native = supportedAndroid();
  if (native !== null) {
    return {
      authorized: () => androidAuthorized(native),
      // Android에는 카테고리 선택이 없다.
      counts: () => ({ appCount: native.getSelectedPackages().length, categoryCount: 0 }),
    };
  }
  return null;
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
 * Android도 같은 기록으로 판단해 처음 켜는 사용자를 권한을 끈 사용자로 보지 않는다.
 */
export async function getAppLockState(): Promise<AppLockState> {
  const reader = lockReader();
  if (reader === null) {
    return UNSUPPORTED;
  }
  const status = readAuthorized(reader.authorized);
  const authorized = status === true;
  const approvedBefore = await readApprovedBefore();
  if (authorized && !approvedBefore) {
    await SecureStore.setItemAsync(APPROVED_BEFORE_KEY, "1", STORE_OPTIONS).catch(() => undefined);
  }
  return {
    supported: true,
    authorized,
    // 키체인 기록은 앱을 지워도 남을 수 있지만, 재설치하면 웹의 켜짐 표시도 지워지고 꺼짐 확인은 켜져 있을 때만 돌아서 낡은 기록이 기능을 잘못 끄지 않는다.
    // 웹의 켜짐 표시가 재설치 뒤에도 남게 바뀌면 이 판단을 다시 본다.
    revoked: approvedBefore && status === false,
    ...selectionCounts(reader.counts),
  };
}

/**
 * Android 권한 받기
 *
 * 두 권한 모두 OS 권한 창이 없고 설정 화면에서 켜야 해서, 고지 화면이 설정을 열고 돌아올 때마다 다시 확인한다.
 * 배터리 안내는 웹의 켜기 응답을 늦추지 않게 기다리지 않는다.
 */
async function authorizeAndroid(native: AppLockNative): Promise<AppLockState> {
  if (readAuthorized(() => androidAuthorized(native)) !== true) {
    await requestConsent();
  }
  const state = await getAppLockState();
  if (state.authorized) {
    const { Manufacturer = "", Brand = "" } = Platform.constants as {
      Manufacturer?: string;
      Brand?: string;
    };
    void offerBatteryGuide(Manufacturer, Brand);
  }
  return state;
}

export async function authorizeAppLock(): Promise<AppLockState> {
  const native = supportedAndroid();
  if (native !== null) {
    return authorizeAndroid(native);
  }
  const rnda = supportedRnda();
  if (
    rnda === null ||
    readAuthorized(() => rnda.getAuthorizationStatus() === APPROVED_STATUS) === true
  ) {
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
 * Android는 고른 패키지 이름 목록을 JSON으로 받아 기기 안에 저장한다.
 */
export async function saveSelection(selection: string | null): Promise<AppLockState> {
  const native = supportedAndroid();
  if (native !== null) {
    const packages = selection === null ? [] : parsePackages(selection);
    if (packages !== null) {
      safely("선택 저장", () => native.setSelectedPackages(packages));
    }
    return getAppLockState();
  }
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

function parsePackages(selection: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(selection);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // 아래에서 형식 오류로 처리한다.
  }
  console.warn("[appLock] 고른 앱 목록 형식이 아니라 저장하지 않음");
  return null;
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
export async function startStudyLock(now: Date = new Date()): Promise<Counts | null> {
  const native = supportedAndroid();
  if (native !== null) {
    return startAndroidLock(native);
  }
  const rnda = supportedRnda();
  const reader = lockReader();
  if (rnda === null || reader === null || readAuthorized(reader.authorized) !== true) {
    return null;
  }
  const counts = selectionCounts(reader.counts);
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
    // 잠그지 못했으면 풀어 줄 잠금이 없어서 먼저 걸어 둔 안전 해제 예약도 지운다.
    safely("실패한 시작의 예약 해제", () => rnda.stopMonitoring([ACTIVITY_NAME]));
    return null;
  }
  return counts;
}

/**
 * Android 공부 시작 잠금
 *
 * 서비스가 앱과 같은 프로세스에서 돌아 앱이 죽으면 잠금도 함께 풀려서 iOS 같은 안전 해제 예약이 따로 없다.
 * 서비스 안의 6시간 타이머는 앱이 살아 있는 채로 공부 끝을 놓쳤을 때를 위한 것이다.
 * 앱이 뒤에 있을 때 포그라운드 서비스 시작이 막히는 기기도 있어 실패는 잠그지 않은 것으로 처리한다.
 */
function startAndroidLock(native: AppLockNative): Counts | null {
  if (readAuthorized(() => androidAuthorized(native)) !== true) {
    return null;
  }
  try {
    const appCount = native.startLock(SAFETY_RELEASE_HOURS * 3_600_000);
    return appCount > 0 ? { appCount, categoryCount: 0 } : null;
  } catch (error) {
    console.warn("[appLock] 잠금 실패", error);
    return null;
  }
}

/**
 * 공부 끝 잠금 해제
 *
 * 공부 중에 고른 앱이 바뀌면 선택 기준으로 풀 때 옛 앱이 잠긴 채 남아서 걸린 잠금을 전부 푼다.
 * 이 앱이 거는 잠금은 공부 잠금 하나뿐이라 전부 풀어도 다른 잠금을 건드리지 않는다.
 * 풀기에 실패했는데 예약까지 지우면 잠금을 풀어 줄 길이 없어져서, 예약은 풀린 뒤에만 지운다.
 */
export async function stopStudyLock(): Promise<void> {
  const native = supportedAndroid();
  if (native !== null) {
    safely("잠금 해제", () => native.stopLock());
    return;
  }
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
  const native = supportedAndroid();
  if (native !== null) {
    safely("실행 시 잠금 정리", () => native.stopLock());
    return;
  }
  const rnda = supportedRnda();
  if (rnda === null) {
    return;
  }
  if (safely("실행 시 잠금 정리", () => rnda.resetBlocks("launch-cleanup"))) {
    safely("실행 시 예약 정리", () => rnda.stopMonitoring([ACTIVITY_NAME]));
  }
}
