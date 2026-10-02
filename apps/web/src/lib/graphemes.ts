/**
 * 눈에 보이는 글자 단위(확장 자소 클러스터) 계산
 *
 * 이모지 조합(ZWJ 시퀀스, 피부색, 국기, 키캡)을 한 글자로 세려면 코드포인트 단위로는 모자란다.
 * Intl.Segmenter가 없는 구형 웹뷰에서는 코드포인트로 나눠 화면이 죽지 않게만 한다 — 그 환경에서
 * 이모지 조합이 여러 글자로 세지지만 최종 판정은 서버가 한다.
 */
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ko", { granularity: "grapheme" })
    : null;

/** Intl.Segmenter를 쓸 수 있는지 — 이게 거짓인 환경에서는 그래핌 개수에 의존하는 검증을 건너뛴다. */
export const canSegmentGraphemes = segmenter !== null;

export function splitGraphemes(text: string): string[] {
  if (segmenter === null) {
    return [...text];
  }
  return Array.from(segmenter.segment(text), (segment) => segment.segment);
}

export function countGraphemes(text: string): number {
  return splitGraphemes(text).length;
}

/**
 * 첫 글자(그래핌). Intl.Segmenter가 없는 환경에서는 글자 단위를 셀 방법이 없으므로
 * 코드포인트 폴백으로 이모지 조합의 반쪽("🧑‍💻" → "🧑")을 주는 대신 빈 문자열을
 * 돌려준다 — 호출부가 `|| 폴백값`으로 안전하게 대체하도록 계약을 명확히 한다.
 */
export function firstGrapheme(text: string): string {
  if (segmenter === null) {
    return "";
  }
  return splitGraphemes(text)[0] ?? "";
}
