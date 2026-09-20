import { DIAGNOSTICS_QUERY_KEY } from "./diagnostics";

/** 졸음 감지를 끄는 URL 질의 파라미터. `?sleep=0`. */
export const SLEEP_DETECTION_QUERY_KEY = "sleep";

/**
 * 졸음 감지를 켤지 판정한다. 기본은 켜짐이고 끄는 쪽만 명시적이다.
 *
 * 끄는 스위치가 필요한 이유는 실기기 발열 A/B다. 얼굴 추론이 더하는 몫만 재려면 같은 기기에서
 * 같은 세션 길이로 켠 채와 끈 채를 번갈아 돌려야 하는데, 재빌드로는 조건이 달라진다.
 *
 * 프로덕션 번들에서도 진단이 켜져 있으면 끌 수 있게 열어 둔다. 앱에 들어가는 웹은 언제나
 * 프로덕션 빌드라, 개발 빌드에서만 통하면 정작 재야 할 환경에서 못 쓴다. 진단 없이 붙인
 * 값은 무시한다. 사용자가 URL로 감지를 끌 이유가 없고 웹뷰 주소는 네이티브가 조립한다.
 */
export function isSleepDetectionEnabled(search: string, dev: boolean): boolean {
  try {
    const params = new URLSearchParams(search);
    const switchable = dev || params.get(DIAGNOSTICS_QUERY_KEY) === "1";
    return !(switchable && params.get(SLEEP_DETECTION_QUERY_KEY) === "0");
  } catch {
    return true;
  }
}
