import { canSegmentGraphemes, normalizeServerText, splitGraphemes } from "@/lib/graphemes";
import i18n from "@/lib/i18n";

/**
 * 프로필 입력 클라이언트 검증
 *
 * 닉네임 규칙은 서버 Nicknames와 같은 순서·같은 판정으로 옮겨 서버가 받는 값만 통과시킨다.
 */

/** 서버와 같은 정규화 — 서버가 저장·중복 판정 전에 적용하는 것과 같은 형태로 맞춘다. */
export function normalizeNickname(nickname: string): string {
  // 전각 영문·반각 가타카나를 보통 글자로 바꿔 같은 이름이 다른 글자로 두 번 쓰이지 않게 한다.
  return normalizeServerText(nickname, "NFKC");
}

/** 닉네임 칸 상한 — 한글·한자·가나는 20자, 영문은 40자다. */
export const NICKNAME_MAX_WIDTH = 40;
// 정규화 비용 자체를 막는 원문 길이(UTF-16 단위) 상한과, 글자 수로 못 막는 ZWJ 사슬을 막는 코드포인트 상한이다.
const NICKNAME_MAX_RAW_CHARS = 256;
const NICKNAME_MAX_CODE_POINTS = 100;

const ALLOWED_SYMBOL = /^[ _.-]$/;
const HANGUL_SYLLABLE = /^[가-힣]$/;
// 라틴 확장-B(U+024F)까지만 받는다.
// 그 뒤는 IPA·장식 글자다.
const LATIN_LETTER = /^(?=\p{L})\p{Script=Latin}$/u;
// 장음 부호 ー는 문자 체계가 Common이라 따로 받는다.
// 가운뎃점 ・와 단독 탁점은 글자가 아니라 빠진다.
const KANA = /^(?:\u30FC|(?=\p{L})[\p{Script=Hiragana}\p{Script=Katakana}])$/u;
const HAN = /^(?=\p{L})\p{Script=Han}$/u;
// Extended_Pictographic은 미래 이모지용 미할당 영역까지 포함하므로 할당된 코드포인트만 이모지로 본다.
const PICTOGRAPHIC = /^(?!\p{Cn})\p{Extended_Pictographic}$/u;
const EMOJI_MODIFIER = /^\p{Emoji_Modifier}$/u;
const REGIONAL_INDICATOR = /^\p{Regional_Indicator}$/u;
// 키캡은 숫자·#·*에 키캡 기호가 붙은 조합이다.
const KEYCAP = /^[0-9#*]\uFE0F?\u20E3$/;
// 🏴 + 태그 글자 + 종료 태그로 된 지역 깃발이다.
const TAG_FLAG = /^\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F}$/u;
const ZWJ = "\u200D";
const VS16 = "\uFE0F";

const isPictographic = (char: string) => PICTOGRAPHIC.test(char);

// 여러 코드포인트로 된 글자 단위는 이모지 조합일 때만 받는다.
// 그림 이모지로 시작하는 조합은 부품(그림 이모지·피부색·VS16·그림 이모지 앞의 ZWJ)만으로 이어져야 한다.
function isEmojiSequence(codePoints: string[]): boolean {
  const [first = "", second = ""] = codePoints;
  const text = codePoints.join("");
  if (REGIONAL_INDICATOR.test(first)) {
    return codePoints.length === 2 && REGIONAL_INDICATOR.test(second);
  }
  if (/^[0-9#*]$/.test(first)) {
    return KEYCAP.test(text);
  }
  if (first === "\u{1F3F4}" && /^[\u{E0020}-\u{E007F}]$/u.test(second)) {
    return TAG_FLAG.test(text);
  }
  return (
    isPictographic(first) &&
    codePoints
      .slice(1)
      .every(
        (char, index) =>
          isPictographic(char) ||
          EMOJI_MODIFIER.test(char) ||
          char === VS16 ||
          (char === ZWJ && isPictographic(codePoints[index + 2] ?? "")),
      )
  );
}

function isAllowedGrapheme(grapheme: string): boolean {
  const codePoints = [...grapheme];
  if (codePoints.length > 1) {
    return isEmojiSequence(codePoints);
  }
  return (
    ALLOWED_SYMBOL.test(grapheme) ||
    HANGUL_SYLLABLE.test(grapheme) ||
    /^[A-Za-z0-9]$/.test(grapheme) ||
    (LATIN_LETTER.test(grapheme) && grapheme.codePointAt(0)! <= 0x024f) ||
    KANA.test(grapheme) ||
    HAN.test(grapheme) ||
    isPictographic(grapheme)
  );
}

function graphemeWidth(grapheme: string): number {
  const codePoints = [...grapheme];
  if (codePoints.length > 1) {
    return isEmojiSequence(codePoints) ? 2 : 1;
  }
  return HANGUL_SYLLABLE.test(grapheme) ||
    KANA.test(grapheme) ||
    HAN.test(grapheme) ||
    isPictographic(grapheme)
    ? 2
    : 1;
}

function widthOf(graphemes: string[]): number {
  return graphemes.reduce((sum, grapheme) => sum + graphemeWidth(grapheme), 0);
}

/** 닉네임 칸 수 — 한글 음절·가나·장음 부호·한자·이모지는 2칸, 나머지 글자 단위는 1칸이다. */
export function nicknameWidth(nickname: string): number {
  return widthOf(splitGraphemes(normalizeNickname(nickname)));
}

/**
 * 닉네임: 앞뒤 공백을 뺀 1글자 이상 40칸 이하, 한글·영문(악센트 포함)·일본어·한자·숫자·이모지·띄어쓰기·_ . -
 *
 * 길이를 넘거나 비면 길이 문구, 받지 않는 글자가 있으면 글자 문구를 돌려준다.
 */
export function validateNickname(nickname: string): string | null {
  // Intl.Segmenter가 없으면 코드포인트로 세게 되는데, 그러면 이모지 조합을 여러 자로
  // 세어 정상 닉네임의 저장을 막아버린다. 이 환경에서는 클라이언트 검증을 건너뛰고
  // 서버 400이 최종 판정하게 한다.
  if (!canSegmentGraphemes) {
    return null;
  }
  const lengthMessage = i18n.t("profile:errors.nicknameLength");
  if (nickname.length > NICKNAME_MAX_RAW_CHARS) {
    return lengthMessage;
  }
  const normalized = normalizeNickname(nickname);
  if ([...normalized].length > NICKNAME_MAX_CODE_POINTS) {
    return lengthMessage;
  }
  const graphemes = splitGraphemes(normalized);
  if (graphemes.length === 0 || widthOf(graphemes) > NICKNAME_MAX_WIDTH) {
    return lengthMessage;
  }
  if (!graphemes.every(isAllowedGrapheme)) {
    return i18n.t("profile:errors.nicknameChars");
  }
  return null;
}

/**
 * 미설정을 null로 맞춘 목표 문구
 *
 * 지운 목표는 서버에 빈 문자열로 남고 공백만 있는 문구도 화면에 보이지 않으므로 둘 다 미설정으로 본다.
 * 공백이 아닌 문구는 다듬지 않고 입력값 그대로 둔다.
 */
export function normalizeGoal(goal: string | null | undefined): string | null {
  return goal?.trim() ? goal : null;
}

/**
 * 목표 문구 검증
 *
 * 공백을 포함해 최대 20자이고 빈 값은 허용한다.
 * 지울 때 보낸 빈 문자열은 서버가 그대로 저장하고 화면은 미설정으로 다룬다.
 */
export function validateGoal(goal: string): string | null {
  if (goal.length > 20) {
    return i18n.t("profile:errors.goalTooLong");
  }
  return null;
}
