import { useSearchParams } from "react-router-dom";

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
 * React 밖에서 신원을 읽는 유일한 경로. 지금은 셸이 모든 탭에 붙여 주는 `?userId=N`이 출처다.
 * 라우트 안에서는 `useUserId`를 쓴다 — 출처가 토큰으로 바뀔 때 두 함수의 본문만 바뀌고
 * 호출부는 그대로다.
 */
export function readUserId(search: string): number | null {
  return parseUserId(new URLSearchParams(search).get(USER_ID_PARAM));
}

/** 현재 라우트의 신원. 없으면 null(브라우저 단독 모드 — 세션이 저장되지 않는다). */
export function useUserId(): number | null {
  const [searchParams] = useSearchParams();
  return parseUserId(searchParams.get(USER_ID_PARAM));
}
