import Constants from "expo-constants";

import { missingConfigError } from "./missingConfigError";

/**
 * 원격 웹(`apps/web`) 베이스 URL — `extra.webBaseUrl`에서 읽는다. 값의 원천은
 * `app.config.ts`의 `APP_VARIANT` 분기다(BY-402): 배포 빌드는 운영 주소, 개발은
 * `.env.local`의 `WEB_BASE_URL` 주입값이며 미주입이면 빈 문자열이다. 빈 값으로 웹뷰를
 * 띄우면 흰 화면만 뜨고 원인을 알 수 없으므로, 여기서 명확하게 실패시킨다.
 * `lib/userApi.ts`의 `apiBaseUrl()`과 같은 패턴이다.
 */
export function getWebBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.webBaseUrl as string | undefined;
  if (!url) {
    throw missingConfigError("webBaseUrl");
  }
  return url;
}
