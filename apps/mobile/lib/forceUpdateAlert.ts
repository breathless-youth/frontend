import { Alert, AppState, Platform } from "react-native";

import { openAppStore } from "./storeLink";

/**
 * 강제 업데이트 안내 — OS 기본 알림창 (BY-586).
 *
 * 커스텀 화면 대신 `Alert.alert`를 쓴다(2026-09-04 결정: 디자인 시안 없이 진행). 문구는 BY-533 확정
 * 카피로 웹 `features/force-update/copy.ts`와 같다(의역·줄임·문장부호 변경 금지).
 *
 * OS 알림창은 버튼을 누르면 무조건 닫히므로 "다시 띄우기"가 곧 차단 로직이다:
 * - 확인 → 스토어 열기 → 앱이 백그라운드로 감 → 복귀(`AppState` active)에서 다시 띄운다.
 * - 스토어가 안 열려(시뮬레이터·스토어 앱 없음) 앱이 그대로 활성이면 잠시 뒤 다시 띄운다.
 * - 그래도 알림창만 사라진 경우(시스템이 내림 등)는 뒤에 깔린 배경을 탭하면 `reshow()`로 다시 띄운다.
 *
 * iOS는 알림창이 겹쳐 쌓이므로 "떠 있다"고 아는 동안은 건너뛴다(알림 센터를 내렸다 올려도 active가
 * 온다). Android는 RN DialogModule이 알림창을 하나만 유지해 새 호출이 기존 것을 대체하므로 복귀 때마다
 * 다시 띄워도 안전하고, 액티비티 재생성으로 창만 사라진 경우까지 함께 복구된다.
 */
export const FORCE_UPDATE_TITLE = "업데이트가 필요해요";
export const FORCE_UPDATE_DESCRIPTION = "원활한 이용을 위해 최신 버전으로 업데이트해 주세요.";
export const FORCE_UPDATE_CONFIRM_LABEL = "지금 업데이트";

/** iOS는 닫힘 애니메이션(약 0.3초) 중에 새 창을 띄우면 표시를 무시하므로 그보다 길게 기다린다. */
export const RESHOW_DELAY_MS = 500;

/** 테스트 주입점. react-native `AppState`가 이 모양을 그대로 만족한다. */
export interface AppStateAdapter {
  currentState: string;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export interface ForceUpdateAlertButton {
  text: string;
  onPress: () => void;
}

export interface ForceUpdateAlertDeps {
  alert(
    title: string,
    message: string,
    buttons: ForceUpdateAlertButton[],
    options: { cancelable: boolean },
  ): void;
  appState: AppStateAdapter;
  openStore(): Promise<void>;
  platform: "android" | "ios";
}

export interface ForceUpdateAlertController {
  /** 알림창을 띄운다. 떠 있다고 아는 동안은 건너뛴다(iOS 겹침 방지). */
  show(): void;
  /** 알림창이 없는 것이 확실할 때(배경 탭) 상태를 초기화하고 다시 띄운다. */
  reshow(): void;
  /** 첫 알림창을 띄우고 복귀 재표시 구독을 건다. 반환값은 해제 함수. */
  start(): () => void;
}

export function createForceUpdateAlert(
  overrides: Partial<ForceUpdateAlertDeps> = {},
): ForceUpdateAlertController {
  const deps: ForceUpdateAlertDeps = {
    alert: (title, message, buttons, options) => Alert.alert(title, message, buttons, options),
    appState: AppState,
    openStore: () => openAppStore(),
    platform: Platform.OS === "android" ? "android" : "ios",
    ...overrides,
  };
  let visible = false;

  function show(): void {
    if (visible) return;
    visible = true;
    deps.alert(
      FORCE_UPDATE_TITLE,
      FORCE_UPDATE_DESCRIPTION,
      [{ text: FORCE_UPDATE_CONFIRM_LABEL, onPress: onConfirm }],
      // Android 뒤로가기·바깥 터치로 닫히지 않게. iOS는 버튼 말고는 닫을 방법이 원래 없다.
      { cancelable: false },
    );
  }

  function reshow(): void {
    visible = false;
    show();
  }

  function onConfirm(): void {
    // 버튼 탭 = 알림창은 이미 닫혔다.
    visible = false;
    const scheduleReshow = () => {
      setTimeout(() => {
        // 스토어가 열렸으면 앱이 백그라운드라 여기서는 건너뛰고 복귀(active)에서 띄운다.
        if (deps.appState.currentState === "active") show();
      }, RESHOW_DELAY_MS);
    };
    void deps.openStore().then(scheduleReshow, scheduleReshow);
  }

  function start(): () => void {
    show();
    const sub = deps.appState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (deps.platform === "android") reshow();
      else show();
    });
    return () => {
      sub.remove();
      visible = false;
    };
  }

  return { show, reshow, start };
}

/** 앱이 쓰는 인스턴스. `app/_layout.tsx`가 forced일 때 `start()`하고 배경 탭에서 `reshow()`한다. */
export const forceUpdateAlert = createForceUpdateAlert();
