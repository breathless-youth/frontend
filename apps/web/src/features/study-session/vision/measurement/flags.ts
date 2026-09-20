import { DIAGNOSTICS_QUERY_KEY, isDiagnosticsEnabled } from "../diagnostics";
import { FACE_BASELINE_MIN_RATIO, FACE_BASELINE_SAMPLES } from "../visionConfig";

/**
 * 측정 도구를 켜는 조건 — 실기기 측정이 끝나면 이 파일도 함께 지운다.
 * 되돌릴 목록은 `measurement.ts` 맨 위 docblock에 있다.
 */

/** 리허설을 켜는 URL 질의 파라미터. `?rehearsal=1`. */
export const REHEARSAL_QUERY_KEY = "rehearsal";

/**
 * 리허설 모드인가.
 *
 * 목적은 **절차 점검이지 값 측정이 아니다.** 기준선 창과 시나리오 시간을 짧게 줄여 한 바퀴를
 * 십몇 분에 돌아 보고, 안내 문구와 순서가 맞는지만 확인한다. 여기서 나온 수치는 본 측정에
 * 쓰지 않는다 — 그래서 화면과 덩어리 양쪽에 켜짐을 표시한다.
 *
 * 진단이 꺼진 채로는 듣지 않는다. 사용자가 URL로 켤 이유가 없고, 웹뷰 주소는 네이티브가 조립한다.
 */
export function isRehearsalEnabled(search: string, dev: boolean): boolean {
  try {
    const params = new URLSearchParams(search);
    const switchable = dev || params.get(DIAGNOSTICS_QUERY_KEY) === "1";
    return switchable && params.get(REHEARSAL_QUERY_KEY) === "1";
  } catch {
    // 손상된 질의 문자열 때문에 세션이 죽으면 안 된다. 켜지지 않는 쪽이 안전하다.
    return false;
  }
}

/** 리허설에서 시간을 줄이는 비율. 두 시간짜리 한 바퀴가 십몇 분이 된다. */
export const REHEARSAL_DIVISOR = 10;

/**
 * 엎드림 기준선 창.
 *
 * 리허설에서는 3분을 기다릴 수 없다. 어댑터가 이미 주입점을 갖고 있으므로 상수 대신 이 값을
 * 넘긴다. 비율은 줄이지 않는다 — 줄이면 판정 성격이 달라져 절차 점검이 아니라 다른 측정이 된다.
 */
export function rehearsalBaseline(rehearsal: boolean): { samples: number; minRatio: number } {
  return {
    samples: rehearsal
      ? Math.max(1, Math.round(FACE_BASELINE_SAMPLES / REHEARSAL_DIVISOR))
      : FACE_BASELINE_SAMPLES,
    minRatio: FACE_BASELINE_MIN_RATIO,
  };
}

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

export const measurementRehearsal = isRehearsalEnabled(
  globalThis.location?.search ?? "",
  import.meta.env.DEV,
);

export const measurementPanelEnabled = isPanelEnabled(globalThis.location?.search ?? "");

/** 어댑터의 `baseline` 기본값이 이 함수를 쓴다. 되돌릴 때 상수 두 개로 복구한다. */
export function measurementBaseline(): { samples: number; minRatio: number } {
  return rehearsalBaseline(measurementRehearsal);
}
