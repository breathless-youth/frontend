import { DIAGNOSTICS_QUERY_KEY, isDiagnosticsEnabled } from "../diagnostics";

/**
 * 측정 도구를 켜는 조건 — 실기기 측정이 끝나면 이 파일도 함께 지운다.
 * 되돌릴 목록은 `measurement.ts` 맨 위 docblock에 있다.
 */

/**
 * 패널을 붙일지.
 *
 * 값을 모으는 조건(진단)보다 **엄하다.** 개발 빌드라는 이유로 화면에 붙으면 스터디룸을 만지는
 * 사람의 화면을 가리고, 화면 테스트의 DOM까지 오염시킨다. `?diag=1`을 실제로 붙인 사람은
 * 측정하러 온 사람뿐이다.
 */
export function isPanelEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get(DIAGNOSTICS_QUERY_KEY) === "1";
  } catch {
    return false;
  }
}

/** 켜는 조건은 기존 진단 플래그와 같다. 앱이 보는 웹은 언제나 프로덕션 빌드다. */
export const measurementEnabled = isDiagnosticsEnabled(
  globalThis.location?.search ?? "",
  import.meta.env.DEV,
);

export const measurementPanelEnabled = isPanelEnabled(globalThis.location?.search ?? "");
