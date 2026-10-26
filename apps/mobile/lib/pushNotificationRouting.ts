import Constants from "expo-constants";

/**
 * 알림 탭 → 앱 내 경로 (BY-586).
 *
 * 서버가 data 페이로드 `link`에 실어 보낸 주소를 expo-router 경로로 바꾼다. 허용하는 형태는 세 가지다:
 * - 앱 스킴(변형별, `extra.appSchemes`): `focusmakers://social/join?code=1234`
 * - 이 빌드가 App Link로 등록한 호스트(`extra.deepLinkHosts`)의 https 링크: `https://web.focusmakers.app/social/join?code=1234`
 * - 앱 내 경로: `/social/join?code=1234`
 * 그 외(다른 도메인, 잘못된 형식, 값 없음)는 홈(`/`)이다 — 알림을 눌렀는데 아무 데도 안 가는 것보다 낫고,
 * 외부 주소를 라우터에 밀어 넣지 않는다. 실제 딥링크 처리(유니버설 링크·Install Referrer)와 같은 라우트
 * (`app/social/join.tsx` 등)로 합류하므로 알림 전용 화면 로직은 없다.
 *
 * `link` 키 이름은 BE 알림 API가 정해지면 그에 맞춘다(현재 계약 없음). dev 백엔드 하나가 staging과
 * development 두 빌드에 푸시를 보내므로, 스킴이 없는 경로형(`/social/join?code=…`)을 기본으로 삼아야
 * 어느 빌드에서든 열린다.
 */
export const PUSH_LINK_KEY = "link";
export const PUSH_HOME_ROUTE = "/";

export type PushLinkAllowList = { schemes: readonly string[]; hosts: readonly string[] };

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i;

// 허용 스킴·호스트는 app.config.ts가 빌드 변형별로 넣는다. 여기 다시 적으면 staging 빌드가
// 운영 링크만 받고 자기 링크는 버리는 일이 생긴다.
function allowListFromConfig(): PushLinkAllowList {
  const extra = Constants.expoConfig?.extra ?? {};
  return {
    schemes: (extra.appSchemes as string[] | undefined) ?? [],
    hosts: (extra.deepLinkHosts as string[] | undefined) ?? [],
  };
}

/** 주소 하나를 경로로. 허용 범위 밖이면 null. */
export function routeFromPushLink(
  link: string | null | undefined,
  allow: PushLinkAllowList = allowListFromConfig(),
): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (trimmed.startsWith("/")) return normalizeRoute(trimmed.split("#")[0]);

  const match = URL_PATTERN.exec(trimmed);
  if (!match) return null;
  const [, scheme, host, path, query = ""] = match;
  const lowerScheme = scheme.toLowerCase();
  const lowerHost = host.toLowerCase();

  if (allow.schemes.includes(lowerScheme)) {
    // 스킴 주소는 "호스트" 자리가 첫 경로 세그먼트다: focusmakers://social/join → /social/join
    return normalizeRoute(`/${host}${path}${query}`);
  }
  if (lowerScheme === "https" && allow.hosts.includes(lowerHost)) {
    return normalizeRoute(`${path === "" ? "/" : path}${query}`);
  }
  return null;
}

function normalizeRoute(route: string): string | null {
  // 빈 경로·루트만 남은 경우도 홈으로 가는 유효한 경로다.
  const withoutTrailingSlash = route.replace(/\/+(\?|$)/, "$1");
  return withoutTrailingSlash === "" ? PUSH_HOME_ROUTE : withoutTrailingSlash;
}

/**
 * 웹 전용 경로를 담당 탭으로 보내는 표
 *
 * 탭 웹뷰가 경로와 쿼리를 그대로 열도록 `path`·`at` 파라미터로 넘긴다(초대코드가 소셜 탭으로 가는 방식).
 * 여기 없는 웹 경로는 홈으로 간다. 세션 화면(`/room/:id`·`/social/room/:id`)은 푸시로 열면 빈 세션이 뜨므로 넣지 않는다.
 */
const WEB_PATH_TAB: Readonly<Record<string, string>> = {
  "/home": "/(tabs)",
  "/timelapses": "/(tabs)",
  "/records": "/(tabs)/records",
  "/planner": "/(tabs)/records",
  "/manual-record": "/(tabs)/records",
  "/ranking": "/(tabs)/ranking",
  "/ranking/records": "/(tabs)/ranking",
  "/settings": "/(tabs)/settings",
  "/timelapse-settings": "/(tabs)/settings",
  "/profile": "/(tabs)/settings",
  "/social": "/(tabs)/social",
  "/social/code": "/(tabs)/social",
};

/** 웹 경로를 여는 탭 href. 표에 없으면 null. 탭이 딥링크 파라미터를 검증할 때도 쓴다(`lib/tabDeepLink.ts`). */
export function tabHrefForWebPath(pathname: string): string | null {
  return WEB_PATH_TAB[pathname] ?? null;
}

/** 쿼리 없이 그대로 네이티브 라우트인 경로. 초대 참여는 자기 라우트(`app/social/join.tsx`)가 있다. */
const NATIVE_ROUTES = new Set(["/", "/records", "/ranking", "/settings", "/social"]);

export type PushTarget = string | { pathname: string; params: { path: string; at: string } };

/**
 * 알림 경로를 expo-router가 열 수 있는 대상으로 바꾼다
 *
 * 탭 루트와 초대 참여는 그대로, 허용된 웹 전용 경로는 담당 탭에 `path` 파라미터로, 나머지는 홈이다.
 * `at`은 같은 경로를 연달아 눌러도 탭이 다시 마운트되게 하는 일회용 값이다.
 * `path`는 한 번 인코딩해 보낸다. expo-router는 href를 만들 때 인코딩하고 상태로 풀 때 한 번, `useLocalSearchParams`에서 또 한 번 디코딩하므로 쿼리 값의 `%26` 같은 이스케이프가 그대로 풀려 버린다.
 */
export function pushTargetForRoute(route: string, at: number = Date.now()): PushTarget {
  const withoutHash = route.split("#")[0] ?? "";
  const [pathname, query = ""] = withoutHash.split("?");
  if (pathname === "/home" && query === "") return PUSH_HOME_ROUTE;
  if (NATIVE_ROUTES.has(pathname) && query === "") return pathname;
  if (pathname === "/social/join") return withoutHash;
  const tab = tabHrefForWebPath(pathname);
  if (tab === null) return PUSH_HOME_ROUTE;
  return { pathname: tab, params: { path: encodeURIComponent(withoutHash), at: String(at) } };
}

/** 알림 페이로드에서 이동할 경로. 항상 문자열을 돌려준다(없으면 홈). */
export function resolvePushRoute(
  data: Record<string, string>,
  allow: PushLinkAllowList = allowListFromConfig(),
): string {
  return routeFromPushLink(data[PUSH_LINK_KEY], allow) ?? PUSH_HOME_ROUTE;
}
