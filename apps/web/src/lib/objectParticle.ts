const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔은 받침이 있다. */
const DIGITS_WITH_FINAL = "013678";

/**
 * 낱말 뒤에 붙일 목적격 조사
 *
 * 마지막 글자에 받침이 있으면 을, 없으면 를이다.
 * 숫자는 한국어로 읽는 소리로 고르고, 판단할 수 없는 글자는 를로 둔다.
 */
export function objectParticle(word: string): "을" | "를" {
  const last = word.at(-1);
  if (last === undefined) {
    return "를";
  }
  const code = last.charCodeAt(0);
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    return (code - HANGUL_FIRST) % 28 === 0 ? "를" : "을";
  }
  return DIGITS_WITH_FINAL.includes(last) ? "을" : "를";
}
