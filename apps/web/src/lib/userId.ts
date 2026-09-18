import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

import { getTokenSource } from "@/lib/auth/tokenSource";

/**
 * URL 쿼리 등 외부 입력에서 온 userId 문자열을 검증한다 — 십진 양의 정수만 유효, 그 외 null.
 *
 * `Number(raw)`만 쓰면 `"0x10"`(16)·`"1e2"`(100) 같은 비십진 표기가 통과하고,
 * MAX_SAFE_INTEGER를 넘는 문자열은 반올림된 엉뚱한 id가 된다 — 신뢰 경계라 표기를 자릿수로 못 박는다.
 */
export function parseUserId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const USER_ID_PARAM = "userId";

/**
 * React 밖에서 신원을 한 번 읽는 경로. 토큰 출처(`getTokenSource`)가 있으면 그 userId가
 * 우선이고, 없거나 null이면 `?userId=N`으로 폴백한다. 신 앱 셸은 이 값을 붙이지 않으므로
 * 폴백을 타는 문서는 구 앱 웹뷰와 브리지 없는 브라우저 단독 모드다. 그 문서들은
 * `legacyUserId`로 구 방식 요청을 낸다.
 *
 * ⚠️ 구독이 없어 토큰 도착에 반응하지 않는다. 웹뷰에서는 브리지 왕복이 끝나기 전에
 * 부르면 null이 나오고 그 값이 그대로 남는다. 값이 늦게 와도 따라가야 하는 곳은 `useUserId`를 쓴다.
 */
export function readUserId(search: string): number | null {
  return (
    getTokenSource()?.getUserId() ?? parseUserId(new URLSearchParams(search).get(USER_ID_PARAM))
  );
}

/**
 * 토큰 출처가 없는 문서가 URL로 받은 신원. 값이 있으면 API·소켓이 구 방식(userId 파라미터,
 * 구 경로, 소켓 쿼리)으로 요청한다. 구 앱은 모든 문서 URL에 `?userId=N`을 붙이므로 이 값은
 * 셸이 토큰 대신 준 신원이다. 출처가 있으면 항상 null이라 신 앱 경로는 이 함수를 무시한다.
 *
 * TODO: 구 앱 퇴출 뒤 이 헬퍼 둘과 `legacyUserId`·`legacyQuery`를 읽는 분기를 전부 지운다. 두 이름을 검색하면 다 잡힌다.
 */
export function legacyUserId(): number | null {
  if (getTokenSource() !== null) {
    return null;
  }
  return parseUserId(new URLSearchParams(window.location.search).get(USER_ID_PARAM));
}

/** 토큰 없는 문서(구 앱)에서만 붙는 쿼리 꼬리. 앞에 다른 쿼리가 있으면 `&`, 없으면 `?`로 시작한다. */
export function legacyQuery(hasQuery: boolean): string {
  const legacy = legacyUserId();
  return legacy === null ? "" : `${hasQuery ? "&" : "?"}userId=${legacy}`;
}

/** 서버 렌더에는 브리지가 없다 — 기다리지 않고 확정으로 본다. */
const getSettledServerSnapshot = () => true;

/** 구독 함수가 없는(토큰 출처가 없는) 경우 렌더마다 새 함수를 만들지 않도록 모듈 레벨에 고정한다. */
const noSubscribe = () => () => {};

const getServerSnapshot = () => null;

/**
 * 현재 라우트의 신원. 토큰 출처가 있으면 그 userId를 구독해 `auth-token` 도착·갱신 시
 * 다시 렌더되고, 없거나 null이면 URL 쿼리로 폴백한다(브라우저 단독 모드).
 *
 * 신원이 늦게 도착해도 따라가야 하는 곳은 `readUserId`가 아니라 이쪽을 쓴다.
 */
export function useUserId(): number | null {
  const [searchParams] = useSearchParams();
  const source = getTokenSource();
  const sourceUserId = useSyncExternalStore(
    source?.subscribe ?? noSubscribe,
    () => source?.getUserId() ?? null,
    getServerSnapshot,
  );
  return sourceUserId ?? parseUserId(searchParams.get(USER_ID_PARAM));
}

/**
 * 신원이 아직 정해지지 않았는지. 토큰 출처가 있는데 첫 `auth-token`이 안 왔으면 true다.
 *
 * BY-528이 웹뷰 URL에서 `?userId=N`을 빼면서, 신원은 브리지 왕복 뒤에야 온다. 첫 렌더에서는
 * 항상 `useUserId() === null`이므로, 그것만 보고 "신원 없음"으로 단정하면 브라우저 단독 모드
 * 안내를 띄우거나(홈·기록) 사용자를 방에서 쫓아낸다(`LiveRoomPage`). 그 판정은 이 훅이
 * false를 준 뒤에 한다.
 *
 * 브라우저 단독 모드에는 출처가 없어 기다릴 것도 없으므로 언제나 false다.
 */
export function useIdentityPending(): boolean {
  const source = getTokenSource();
  const settled = useSyncExternalStore(
    source?.subscribe ?? noSubscribe,
    () => source?.hasSettled() ?? true,
    getSettledServerSnapshot,
  );
  return !settled;
}
