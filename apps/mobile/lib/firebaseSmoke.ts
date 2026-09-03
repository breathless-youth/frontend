import * as Application from "expo-application";
import { Platform } from "react-native";

import type * as PushMessagingModule from "./pushMessaging";
import type * as RemoteConfigModule from "./remoteConfig";

/**
 * 개발 전용 Firebase 배선 확인 로그 (BY-585).
 *
 * dev 프로젝트 Remote Config의 `smoke_test` 키 값과 FCM 토큰을 콘솔에 남긴다. 값이 콘솔에 넣은
 * 그대로 찍히면 SDK·설정 파일·plugin 배선이 실기기에서 동작한다는 증거다. production 빌드에서는
 * 아무것도 하지 않는다. **BY-586에서 실사용 코드로 대체하면서 삭제한다.**
 *
 * 스모크는 확인이 목적이라 fetch를 기다렸다가 activate한다 — 부팅 전략(activate 먼저, fetch는
 * 백그라운드)과 다르다. 개발 빌드는 fetch 최소 간격이 0이라 재실행마다 서버 값을 새로 받는다.
 *
 * RNFB 어댑터는 지연 로드한다 — 네이티브 모듈이 없는 바이너리(옛 Dev Client)에서도 앱은 뜨고, 아래
 * 설치 정보 로그로 어느 바이너리인지 알 수 있어야 한다. 실사용 코드(BY-586)는 정적 import로 간다.
 */
const SMOKE_KEY = "smoke_test";

export async function logFirebaseSmoke(): Promise<void> {
  if (!__DEV__) {
    return;
  }
  // 어느 바이너리인지 구분하기 위한 설치 정보. iOS 설치 시각은 덮어쓰기 설치에서 안 바뀌므로 참고용이고,
  // Android는 마지막 업데이트 시각이 바뀐다. versionCode/buildNumber(EAS 원격 값)도 함께 남긴다.
  const installedAt = await Application.getInstallationTimeAsync().catch(() => null);
  const updatedAt =
    Platform.OS === "android" ? await Application.getLastUpdateTimeAsync().catch(() => null) : null;
  // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
  console.log(
    `[firebase-smoke] binary installed=${installedAt?.toISOString() ?? "?"} updated=${updatedAt?.toISOString() ?? "-"} build=${Application.nativeBuildVersion ?? "?"} version=${Application.nativeApplicationVersion ?? "?"}`,
  );

  let remoteConfig: typeof RemoteConfigModule;
  let pushMessaging: typeof PushMessagingModule;
  try {
    [remoteConfig, pushMessaging] = await Promise.all([
      import("./remoteConfig"),
      import("./pushMessaging"),
    ]);
  } catch (error) {
    console.warn(
      "[firebase-smoke] RNFB 네이티브 모듈 없음 — 이 바이너리에 Firebase SDK가 들어 있지 않다(Expo Go나 옛 Dev Client)",
      error,
    );
    return;
  }
  // Metro는 모듈 평가가 실패해도 import()를 거부하지 않고 빈 네임스페이스를 줄 수 있다 — 함수 유무로 한 번 더 가른다.
  if (
    typeof remoteConfig.setRemoteConfigDefaults !== "function" ||
    typeof pushMessaging.getPushToken !== "function"
  ) {
    console.warn(
      "[firebase-smoke] RNFB 어댑터 로드 실패 — 이 바이너리에 Firebase SDK가 들어 있지 않다(Expo Go나 옛 Dev Client)",
    );
    return;
  }

  try {
    await remoteConfig.setRemoteConfigDefaults({ [SMOKE_KEY]: "(기본값 — 서버 값을 못 받음)" });
    await remoteConfig.fetchRemoteConfig();
    const activated = await remoteConfig.activateRemoteConfig();
    // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
    console.log(
      `[firebase-smoke] remote config ${SMOKE_KEY}=${JSON.stringify(remoteConfig.getRemoteConfigString(SMOKE_KEY))} activated=${String(activated)}`,
    );
  } catch (error) {
    console.warn("[firebase-smoke] remote config 실패", error);
  }

  // iOS는 APNs 기기 토큰이 와야 FCM 토큰이 나온다 — 어댑터가 없으면 등록해 기다리므로 여기선 상태만 남긴다.
  // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
  console.log(
    `[firebase-smoke] apns token ${(await pushMessaging.getApnsToken()) ? "있음" : "없음"}`,
  );
  try {
    const token = await pushMessaging.getPushToken();
    // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
    console.log(`[firebase-smoke] fcm token ${token ?? "(없음)"}`);
  } catch (error) {
    console.warn("[firebase-smoke] fcm token 실패", error);
  }
}
