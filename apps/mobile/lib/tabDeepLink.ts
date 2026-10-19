import { tabHrefForWebPath } from "./pushNotificationRouting";

export type RemoteScreenInput = {
  key: string;
  path: string;
  /** 뒤로가기 탭 초기화·앱 실행 신호의 기준이 되는 탭 루트. */
  resetPath: string;
  extraQuery?: Record<string, string>;
};

/**
 * 탭이 받은 딥링크 파라미터를 `RemoteScreen` 입력으로
 *
 * 푸시 알림이 `path`(쿼리 포함 웹 경로)·`at`(일회용 값)으로 탭을 연다(`lib/pushNotificationRouting.ts`).
 * `RemoteScreen`은 `path`에 `?`를 붙이면 URL이 깨지므로 쿼리는 `extraQuery`로 떼어 준다.
 * `at`을 key에 섞어야 같은 경로를 연달아 받아도 다시 마운트된다.
 * `path`는 `pushTargetForRoute`가 한 번 인코딩한 값이 라우터를 거치며 풀려 원래 경로로 도착한다.
 * 쿼리는 첫 `?`에서만 가르고, 같은 키가 반복되면 웹이 읽는 첫 값을 남긴다.
 * 커스텀 스킴은 어떤 경로든 라우팅하므로 이 탭이 여는 경로(`WEB_PATH_TAB`)가 아니면 루트를 연다. 세션 화면이 탭 웹뷰 안에 뜨는 것을 막는 마지막 문이다.
 */
export function remoteScreenInput(
  params: { path?: string | string[]; at?: string | string[] },
  root: string,
): RemoteScreenInput {
  const { path, at } = params;
  if (typeof path !== "string" || !path.startsWith("/")) {
    return { key: root, path: root, resetPath: root };
  }
  const mark = path.indexOf("?");
  const pathname = mark === -1 ? path : path.slice(0, mark);
  if (tabHrefForWebPath(pathname) !== tabHrefForWebPath(root)) {
    return { key: root, path: root, resetPath: root };
  }
  const extraQuery: Record<string, string> = {};
  if (mark !== -1) {
    for (const [key, value] of new URLSearchParams(path.slice(mark + 1))) {
      if (!Object.hasOwn(extraQuery, key)) extraQuery[key] = value;
    }
  }
  return {
    key: `${path}-${typeof at === "string" ? at : ""}`,
    path: pathname,
    resetPath: root,
    ...(Object.keys(extraQuery).length > 0 ? { extraQuery } : {}),
  };
}
