import { Platform } from "react-native";

import { googleDeferredLinkNative } from "../modules/google-deferred-link";

export type GoogleDeferredLinkRead =
  | { result: "found"; url: string }
  | { result: "empty" }
  | { result: "error" }
  | { result: "unsupported" };

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_INTERVAL_MS = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 구글 광고 지연 딥링크 읽기
 *
 * GA4 SDK는 첫 실행에서 딥링크를 비동기로 받아 오므로 값이 들어올 때까지 간격을 두고 다시 묻는다.
 * 네이티브 오류는 다시 물어도 나아지지 않아 바로 error로 끝낸다.
 * iOS는 구글이 사람별 설치 정보를 주지 않아 읽지 않는다.
 */
export async function readGoogleDeferredDeepLink(
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<GoogleDeferredLinkRead> {
  const native = googleDeferredLinkNative;
  if (Platform.OS !== "android" || native === null) return { result: "unsupported" };
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let url: string | null;
    try {
      url = native.readDeepLink();
    } catch (error) {
      console.warn("[google-deferred-link] 읽기 실패", error);
      return { result: "error" };
    }
    if (url) return { result: "found", url };
    if (attempt < attempts) await wait(intervalMs);
  }
  return { result: "empty" };
}
