import Constants from "expo-constants";

import { missingConfigError } from "./missingConfigError";

/**
 * 백엔드 API 베이스 URL — `extra.apiBaseUrl`에서 읽는다.
 */
export function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) {
    throw missingConfigError("apiBaseUrl");
  }
  return url;
}
