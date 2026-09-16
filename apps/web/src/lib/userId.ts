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
 * React 밖에서 신원을 읽는 유일한 경로. 토큰 출처(`getTokenSource`)가 있으면 그 userId가
 * 우선이고, 없거나 null이면 셸이 모든 탭에 붙여 주는 `?userId=N`으로 폴백한다.
 * URL 폴백은 다음 단계에서 사라진다. 라우트 안에서는 `useUserId`를 쓴다.
 */
export function readUserId(search: string): number | null {
  return (
    getTokenSource()?.getUserId() ?? parseUserId(new URLSearchParams(search).get(USER_ID_PARAM))
  );
}

/** 구독 함수가 없는(토큰 출처가 없는) 경우 렌더마다 새 함수를 만들지 않도록 모듈 레벨에 고정한다. */
const noSubscribe = () => () => {};

const getServerSnapshot = () => null;

/**
 * 현재 라우트의 신원. 토큰 출처가 있으면 그 userId를 구독해 `auth-token` 도착·갱신 시
 * 다시 렌더되고, 없거나 null이면 URL 쿼리로 폴백한다(브라우저 단독 모드).
 * URL 폴백은 다음 단계에서 사라진다.
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
