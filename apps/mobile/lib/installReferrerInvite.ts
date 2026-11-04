import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";

import { inviteCodeFrom } from "./sessionInvite";

/**
 * Play Install Referrer로 초대코드 복원
 *
 * 웹 join 화면의 스토어 버튼이 `referrer=code%3D{코드}`를 실어 보내고, 설치 후 첫 실행에서 여기로 돌아온다.
 * 코드는 예전 방의 숫자 4자리이거나 그룹의 6자리다.
 * referrer는 다시 조회할 수 있으므로 한 번 읽은 뒤 표시를 남겨 실행마다 다시 이동하지 않게 한다.
 * 조회에 실패하면 표시 없이 끝나 다음 실행에서 다시 시도한다.
 */
const CONSUMED_KEY = "inviteReferrerConsumedV1";

export function inviteRouteFromInstallReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  // 숫자 4자리 코드는 문자열 그대로 넘겨 앞자리 0을 지키고, 그룹 코드는 정리한 모양으로 넘긴다.
  const code = inviteCodeFrom(new URLSearchParams(referrer).get("code"));
  return code === null ? null : `/social/join?code=${code}`;
}

export async function consumePendingInviteRoute(): Promise<string | null> {
  let route: string | null;
  try {
    if ((await SecureStore.getItemAsync(CONSUMED_KEY)) === "1") return null;
    route = inviteRouteFromInstallReferrer(await Application.getInstallReferrerAsync());
  } catch {
    return null;
  }
  try {
    await SecureStore.setItemAsync(CONSUMED_KEY, "1");
  } catch {
    // 플래그 쓰기 실패로 확정된 경로까지 버리지 않는다.
    // 다음 실행에서 같은 경로로 한 번 더 이동할 수 있지만 프리필 화면이라 영향이 없다.
  }
  return route;
}
