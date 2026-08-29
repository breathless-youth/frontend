import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";

/**
 * Play Install Referrer로 초대코드를 복원한다. 웹 join 화면의 스토어 버튼이
 * `referrer=code%3DXXXX`를 실어 보내고, 설치 후 첫 실행에서 여기로 돌아온다.
 * referrer는 재조회가 가능하므로 한 번 읽은 뒤 플래그를 남겨 실행마다 다시 이동하지
 * 않게 한다. 조회 실패는 플래그 없이 끝나 다음 실행에서 재시도된다.
 */
const CONSUMED_KEY = "inviteReferrerConsumedV1";

export function inviteRouteFromInstallReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  const code = new URLSearchParams(referrer).get("code");
  // 숫자 4자리만 통과시키고 문자열을 그대로 보존한다 (number로 바꾸면 앞자리 0이 사라진다).
  if (code === null || !/^\d{4}$/.test(code)) return null;
  return `/social/join?code=${code}`;
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
