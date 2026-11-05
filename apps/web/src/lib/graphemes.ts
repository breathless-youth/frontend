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

// 서버 자바 String.strip()은 Character.isWhitespace 기준이라 JS trim()과 빼는 글자가 다르다.
// trim()은 NBSP(U+00A0)와 BOM(U+FEFF)까지 빼지만 strip()은 둘을 남기고, 대신 U+001C~U+001F 제어 문자를 뺀다.
// isWhitespace는 유니코드 공백 분리자를 받되 줄바꿈 없는 공백인 U+00A0, U+2007, U+202F는 받지 않는다.
// 편집기에서 보이지 않는 글자라 글자 그대로 적으면 실수로 사라지기 쉬워 코드포인트로 적는다.
const SERVER_STRIPPED_SPACE =
  // eslint-disable-next-line no-control-regex -- U+001C~U+001F는 Character.isWhitespace가 빼는 제어 문자다
  /^[ \t\n\v\f\r\u001C-\u001F\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+|[ \t\n\v\f\r\u001C-\u001F\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+$/g;

/**
 * 서버와 같은 글 다듬기
 *
 * 서버가 글자 수를 세거나 저장하기 전에 하는 것처럼 NFC로 맞추고 앞뒤 공백을 자바 strip() 기준으로 뺀다.
 * trim()으로 다듬으면 NBSP가 붙은 글을 화면은 통과시키고 서버만 거절해 한도 끝에서 판정이 어긋난다.
 * 서버가 닉네임만 NFKC로 맞추므로 닉네임은 정규화 형식을 바꿔 부른다.
 */
export function normalizeServerText(text: string, form: "NFC" | "NFKC" = "NFC"): string {
  return text.normalize(form).replace(SERVER_STRIPPED_SPACE, "");
}
