import { canSegmentGraphemes, normalizeServerText, splitGraphemes } from "@/lib/graphemes";

/**
 * 프로필 입력 클라이언트 검증
 */

/** 서버와 같은 정규화 — 서버가 저장·중복 판정 전에 적용하는 것과 같은 형태로 맞춘다. */
export function normalizeNickname(nickname: string): string {
  return normalizeServerText(nickname);
}

/** 닉네임 형식 오류 문구 — 저장 화면과 서버 400 응답이 같은 문구를 쓴다. */
export const NICKNAME_RULE_MESSAGE = "한글, 영문, 숫자, 이모지, 띄어쓰기로 2~12자를 쓰실 수 있어요";

const PLAIN_CHAR = /^[가-힣A-Za-z0-9 ]$/;
// 키캡은 숫자·#·*에 키캡 기호가 붙은 조합이라 부품 목록으로 판정할 수 없다.
// 숫자를 부품에 넣으면 "#"·"*" 하나만 있어도 통과해, 서버가 거부하는 닉네임을 화면이 받아버린다.
const KEYCAP_CHAR = /^[0-9#*]\uFE0F?\u20E3$/;
// 이모지 조합 부품을 전부 담아야 "🧑‍💻"·"🇰🇷" 같은 조합이 한 글자로 통과한다.
// 부품은 피부색 수정자, ZWJ, 이모지 표현 선택자, 국기의 지역 지시자, 태그 영역이다.
// 보이지 않는 문자를 그대로 적으면 편집기에서 안 보여 실수로 지워지므로 코드포인트로 적는다.
const EMOJI_CHAR =
  // eslint-disable-next-line no-misleading-character-class -- 결합이 아니라 조합 부품 하나하나를 판정한다
  /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u{E0020}-\u{E007F}]+$/u;
// EMOJI_CHAR는 부품 집합에 들어 있기만 하면 통과시켜서, 단독 VS16·단독 ZWJ·단독 피부색
// 수정자만 와도 인정해 버린다. 셋 다 Extended_Pictographic이 아니라 서버는 단독으로 오면
// 거부한다. 조합의 시작 글자가 그림 이모지이거나 국기의 지역 지시자일 때만 인정하도록
// 시작 글자를 따로 확인한다.
const EMOJI_BASE = /^[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/**
 * 닉네임: 눈에 보이는 글자 단위(그래핌) 2~12자, 한글·영문·숫자·이모지·띄어쓰기.
 */
export function validateNickname(nickname: string): string | null {
  // Intl.Segmenter가 없으면 코드포인트로 세게 되는데, 그러면 이모지 조합을 여러 자로
  // 세어 정상 닉네임의 저장을 막아버린다. 이 환경에서는 클라이언트 검증을 건너뛰고
  // 서버 400이 최종 판정하게 한다.
  if (!canSegmentGraphemes) {
    return null;
  }
  const graphemes = splitGraphemes(normalizeNickname(nickname));
  if (graphemes.length < 2 || graphemes.length > 12) {
    return NICKNAME_RULE_MESSAGE;
  }
  const allValid = graphemes.every(
    (char) =>
      PLAIN_CHAR.test(char) ||
      KEYCAP_CHAR.test(char) ||
      (EMOJI_BASE.test(char) && EMOJI_CHAR.test(char)),
  );
  if (!allValid) {
    return NICKNAME_RULE_MESSAGE;
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
    return "목표는 20자까지 쓸 수 있어요";
  }
  return null;
}
