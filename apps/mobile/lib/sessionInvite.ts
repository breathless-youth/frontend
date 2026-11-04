import { trackNativeEvent } from "./nativeAnalytics";

/**
 * 세션 중에 들어온 초대를 세션 화면에 넘기는 통로
 *
 * 세션 화면은 루트 Stack에 모달로 떠 있어서, 초대 링크가 평소대로 화면을 쌓으면 그 위에 시트로 뜬다.
 * 링크 진입부(`+native-intent`, 푸시)와 세션 화면은 React 트리에서 조상·자손 관계가 아니라 모듈 스코프에 핸들러 하나를 둔다.
 */

type InviteHandler = (code: string) => void;

let handler: InviteHandler | null = null;

/** 예전 방의 숫자 4자리 초대코드 */
const ROOM_INVITE_CODE = /^\d{4}$/;

/** 그룹 초대코드 사이에 끼어 와도 버리는 구분 글자 */
const GROUP_INVITE_CODE_SEPARATORS = /[\s-]/g;

/**
 * 정리한 그룹 초대코드
 *
 * 서버는 헷갈리는 0, O, 1, I, L을 뺀 영문 대문자와 숫자 6자리로 만든다.
 */
const GROUP_INVITE_CODE = /^[A-HJKMNP-Z2-9]{6}$/;

/**
 * 링크에 실린 초대코드 정리
 *
 * 예전 방의 숫자 4자리 코드는 앞자리 0까지 받은 그대로 돌려준다.
 * 설치 유입과 일반 링크는 코드를 웹에 넘기고 웹이 4자리 코드를 그룹 탭으로 보내므로 앱은 이 코드를 막지 않는다.
 * 세션 중에 받은 4자리 코드를 거르는 곳은 `offerRouteToSession`이다.
 * 그룹의 6자리 코드는 공백과 하이픈을 버리고 대문자로 맞춘 뒤 서버가 쓰는 글자로만 되어 있을 때 돌려준다.
 * 대문자로 바꾸면 ß처럼 영문이 아닌 글자가 영문 두 글자가 되기도 해서 영문과 숫자만 남았는지 먼저 본다.
 * 어느 모양도 아니면 null이다.
 * 어느 쪽 초대인지는 웹이 코드 모양으로 구분하므로 앱은 코드만 넘긴다.
 */
export function inviteCodeFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (ROOM_INVITE_CODE.test(value)) return value;
  const compact = value.replace(GROUP_INVITE_CODE_SEPARATORS, "");
  if (!/^[A-Za-z0-9]{6}$/.test(compact)) return null;
  const code = compact.toUpperCase();
  return GROUP_INVITE_CODE.test(code) ? code : null;
}

/**
 * `/social/join?code=` 경로의 초대코드
 *
 * 초대 경로가 아니거나 코드 모양이 틀리면 null이다.
 * 코드 값을 디코딩하지 않는 이유는 앱의 URLSearchParams가 잘못된 퍼센트 인코딩에 예외를 내서다.
 * 두 코드 모양 모두 인코딩이 필요 없는 글자라 디코딩하지 않아도 그대로 읽힌다.
 */
export function inviteCodeFromRoute(route: string): string | null {
  const [path, query = ""] = route.split("?");
  if (path !== "/social/join") return null;
  return inviteCodeFrom(/(?:^|&)code=([^&#]*)/.exec(query)?.[1]);
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
 * 가로챘으면 true를 돌려주고, 호출부는 화면 이동을 하지 않는다.
 * 세션 화면에는 그룹의 6자리 코드만 넘긴다.
 * 예전 방의 숫자 4자리 코드는 새 앱에서 쓰지 않으므로 확인 창도 공부 종료도 없이 링크만 가로챈다.
 * 링크를 평소대로 보내면 소셜 탭이 세션 위에 시트로 쌓이기 때문이다.
 * 가로채면 `social/join` 화면이 그려지지 않으므로 그 화면이 남기던 진입 이벤트를 코드 모양과 상관없이 여기서 남긴다.
 */
export function offerRouteToSession(route: string): boolean {
  const code = inviteCodeFromRoute(route);
  if (code === null || handler === null) return false;
  trackNativeEvent("invite_deep_link_opened", { has_code: true });
  if (ROOM_INVITE_CODE.test(code)) return true;
  handler(code);
  return true;
}
