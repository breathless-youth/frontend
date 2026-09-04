import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";

import { readRecommendedUpdateCopy, type RecommendedUpdateCopy } from "./recommendedUpdateCopy";
import { openAppStore } from "./storeLink";

export {
  RECOMMENDED_UPDATE_CONFIRM_LABEL,
  RECOMMENDED_UPDATE_DESCRIPTION,
  RECOMMENDED_UPDATE_LATER_LABEL,
  RECOMMENDED_UPDATE_TITLE,
} from "./recommendedUpdateCopy";

/**
 * 권장 업데이트 안내 — 닫을 수 있는 OS 알림창 (BY-586).
 *
 * `lib/forceUpdate.ts`가 Remote Config `latest_version`이 앱 버전보다 높다고 판정하면 `app/_layout.tsx`가
 * 홈을 그린 뒤 `maybeShow(latestVersion)`을 부른다. 강제와 달리 "나중에"가 있고 앱 사용을 막지 않는다.
 *
 * 빈도는 **최신 버전당 한 번**이다. 어느 버튼을 누르든(뒤로가기·바깥 터치 포함) 그 `latest_version`을
 * 기록해 두고 같은 값에는 다시 묻지 않는다. 콘솔에서 더 높은 값을 게시하면 다시 한 번 묻는다.
 * 기록 저장소는 앱의 유일한 로컬 저장소인 SecureStore를 그대로 쓴다(`lib/deviceId.ts`와 같은 이유).
 *
 * 문구는 띄울 때마다 `lib/recommendedUpdateCopy.ts`에서 읽는다 — 콘솔(Remote Config) 값이 있으면 그것,
 * 없으면 앱 초안 문구.
 */
export const DISMISSED_VERSION_KEY = "focuson.recommendedUpdateDismissedVersion";

export interface RecommendedUpdateAlertButton {
  text: string;
  style?: "cancel" | "default";
  onPress: () => void;
}

export interface RecommendedUpdateAlertDeps {
  alert(
    title: string,
    message: string,
    buttons: RecommendedUpdateAlertButton[],
    options: { cancelable: boolean; onDismiss: () => void },
  ): void;
  openStore(): Promise<void>;
  storage: {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
  };
  /** 띄울 때마다 읽는다. */
  getCopy(): RecommendedUpdateCopy;
}

export interface RecommendedUpdateAlertController {
  /**
   * 이 최신 버전에 대해 아직 묻지 않았으면 알림창을 띄운다. 띄웠으면 true. 어떤 실패도 throw하지 않는다 —
   * 저장소를 못 읽으면 한 번 더 묻는 쪽으로 기운다(권장은 잔소리가 차단보다 낫다).
   */
  maybeShow(latestVersion: string): Promise<boolean>;
}

export function createRecommendedUpdateAlert(
  overrides: Partial<RecommendedUpdateAlertDeps> = {},
): RecommendedUpdateAlertController {
  const deps: RecommendedUpdateAlertDeps = {
    alert: (title, message, buttons, options) => Alert.alert(title, message, buttons, options),
    openStore: () => openAppStore(),
    storage: SecureStore,
    getCopy: readRecommendedUpdateCopy,
    ...overrides,
  };

  async function maybeShow(latestVersion: string): Promise<boolean> {
    let dismissed: string | null = null;
    try {
      dismissed = await deps.storage.getItemAsync(DISMISSED_VERSION_KEY);
    } catch (error) {
      console.warn("[recommended-update] 기록을 읽지 못해 다시 묻는다", error);
    }
    if (dismissed === latestVersion) return false;

    const remember = () => {
      deps.storage.setItemAsync(DISMISSED_VERSION_KEY, latestVersion).catch((error: unknown) => {
        console.warn("[recommended-update] 기록 저장 실패 — 다음 실행에 다시 묻는다", error);
      });
    };
    const copy = deps.getCopy();
    deps.alert(
      copy.title,
      copy.message,
      [
        { text: copy.laterLabel, style: "cancel", onPress: remember },
        {
          text: copy.confirmLabel,
          onPress: () => {
            remember();
            void deps.openStore();
          },
        },
      ],
      // Android 뒤로가기·바깥 터치 = "나중에". iOS는 버튼으로만 닫힌다.
      { cancelable: true, onDismiss: remember },
    );
    return true;
  }

  return { maybeShow };
}

/** 앱이 쓰는 인스턴스. */
export const recommendedUpdateAlert = createRecommendedUpdateAlert();
