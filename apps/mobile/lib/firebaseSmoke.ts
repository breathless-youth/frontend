import { getApnsToken, getPushToken } from "./pushMessaging";
import {
  activateRemoteConfig,
  fetchRemoteConfig,
  getRemoteConfigString,
  setRemoteConfigDefaults,
} from "./remoteConfig";

/**
 * 개발 전용 Firebase 배선 확인 로그 (BY-585).
 *
 * dev 프로젝트 Remote Config의 `smoke_test` 키 값과 FCM 토큰을 콘솔에 남긴다. 값이 콘솔에 넣은
 * 그대로 찍히면 SDK·설정 파일·plugin 배선이 실기기에서 동작한다는 증거다. production 빌드에서는
 * 아무것도 하지 않는다. **BY-586에서 실사용 코드로 대체하면서 삭제한다.**
 *
 * 스모크는 확인이 목적이라 fetch를 기다렸다가 activate한다 — 부팅 전략(activate 먼저, fetch는
 * 백그라운드)과 다르다. 개발 빌드는 fetch 최소 간격이 0이라 재실행마다 서버 값을 새로 받는다.
 */
const SMOKE_KEY = "smoke_test";

export async function logFirebaseSmoke(): Promise<void> {
  if (!__DEV__) {
    return;
  }
  try {
    await setRemoteConfigDefaults({ [SMOKE_KEY]: "(기본값 — 서버 값을 못 받음)" });
    await fetchRemoteConfig();
    const activated = await activateRemoteConfig();
    // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
    console.log(
      `[firebase-smoke] remote config ${SMOKE_KEY}=${JSON.stringify(getRemoteConfigString(SMOKE_KEY))} activated=${String(activated)}`,
    );
  } catch (error) {
    console.warn("[firebase-smoke] remote config 실패", error);
  }
  // iOS는 APNs 기기 토큰이 와야 FCM 토큰이 나온다 — 어댑터가 없으면 등록해 기다리므로 여기선 상태만 남긴다.
  // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
  console.log(`[firebase-smoke] apns token ${(await getApnsToken()) ? "있음" : "없음"}`);
  try {
    const token = await getPushToken();
    // eslint-disable-next-line no-console -- 개발 전용 배선 확인 로그(의도된 출력)
    console.log(`[firebase-smoke] fcm token ${token ?? "(없음)"}`);
  } catch (error) {
    console.warn("[firebase-smoke] fcm token 실패", error);
  }
}
