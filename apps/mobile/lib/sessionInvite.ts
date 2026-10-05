import { trackNativeEvent } from "./nativeAnalytics";

/**
 * 세션 중에 들어온 초대를 세션 화면에 넘기는 통로
 *
 * 세션 화면은 루트 Stack에 모달로 떠 있어서, 초대 링크가 평소대로 화면을 쌓으면 그 위에 시트로 뜬다.
 * 링크 진입부(`+native-intent`, 푸시)와 세션 화면은 React 트리에서 조상·자손 관계가 아니라 모듈 스코프에 핸들러 하나를 둔다.
 */

type InviteHandler = (code: string) => void;

let handler: InviteHandler | null = null;

/** 초대코드 형식(4자리 숫자) 검사 */
export function isInviteCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

/**
 * `/social/join?code=NNNN` 경로의 초대코드
 *
 * 초대 경로가 아니거나 코드 형식이 틀리면 null이다.
 */
export function inviteCodeFromRoute(route: string): string | null {
  const [path, query = ""] = route.split("?");
  if (path !== "/social/join") return null;
  const code = /(?:^|&)code=([^&#]*)/.exec(query)?.[1];
  return isInviteCode(code) ? code : null;
}

/**
 * 세션 화면의 초대 핸들러 등록
 *
 * 반환값을 부르면 해제된다.
 */
export function setSessionInviteHandler(next: InviteHandler): () => void {
  handler = next;
  return () => {
    // 늦게 도착한 해제가 그사이 새로 등록된 핸들러를 지우지 않게 한다.
    if (handler === next) handler = null;
  };
}

/**
 * 초대 경로를 열려 있는 세션 화면에 넘기기
 *
 * 넘겼으면 true를 돌려주고, 호출부는 화면 이동을 하지 않는다.
 * 가로채면 `social/join` 화면이 그려지지 않으므로 그 화면이 남기던 진입 이벤트를 여기서 남긴다.
 */
export function offerRouteToSession(route: string): boolean {
  const code = inviteCodeFromRoute(route);
  if (code === null || handler === null) return false;
  trackNativeEvent("invite_deep_link_opened", { has_code: true });
  handler(code);
  return true;
}
