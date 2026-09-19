import { canSegmentGraphemes, countGraphemes, splitGraphemes } from "@/lib/graphemes";

/**
 * 프로필 입력 클라이언트 검증
 */

// JS trim()은 NBSP(U+00A0)·BOM(U+FEFF)까지 지우지만 서버 Java String.strip()은
// Character.isWhitespace 기준이라 그 둘을 남겨서 거부한다. trim()을 쓰면 화면은
// 통과시키고 서버에서만 400이 나므로, 서버가 지우는 것과 정확히 같은 집합만 잘라낸다.
// Character.isWhitespace는 ASCII 공백류(tab·LF·VT·FF·CR·space)·U+001C~U+001F 제어문자에
// 더해 유니코드 공백 분리자(Zs/Zl/Zp) 대부분을 지우지만, 그중 NBSP(U+00A0)·U+2007·
// U+202F 셋은 "줄바꿈 없는 공백"이라는 이유로 명시적으로 제외한다. BOM(U+FEFF)은 애초에
// 공백이 아니라 서식 문자(Cf)라 대상이 아니다. 이 정규식이 그 예외 셋을 코드포인트로
// 남겨 형식 검증이 계속 거부하게 두는 것도 같은 이유다(편집기에서 안 보이는 문자라
// 리터럴로 적으면 실수로 지워지므로 코드포인트로 적는다).
const TRIMMED_SPACE =
  // eslint-disable-next-line no-control-regex -- U+001C~U+001F는 Character.isWhitespace가 지우는 제어문자다
  /^[ \t\n\v\f\r\u001C-\u001F\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+|[ \t\n\v\f\r\u001C-\u001F\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+$/g;

/** 서버와 같은 정규화 — 서버가 저장·중복 판정 전에 적용하는 것과 같은 형태로 맞춘다. */
export function normalizeNickname(nickname: string): string {
  return nickname.normalize("NFC").replace(TRIMMED_SPACE, "");
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
 * 닉네임 길이만: 입력 중 실시간 안내용(12자 초과). 형식·최소 길이는 저장 시점의
 * `validateNickname`이 본다 — 타이핑 도중(1자, 조합 중)의 미완성 입력까지 실시간으로
 * 오류를 띄우면 정상 입력 과정이 계속 빨갛게 깜빡인다.
 */
export function validateNicknameLength(nickname: string): string | null {
  // 코드포인트 폴백에서는 이모지 조합이 여러 자로 잡혀 정상 입력을 12자 초과로
  // 잘못 안내하므로, 같은 이유로 이 환경에서는 건너뛴다.
  if (!canSegmentGraphemes) {
    return null;
  }
  if (countGraphemes(normalizeNickname(nickname)) > 12) {
    return "닉네임은 12자까지 쓸 수 있어요";
  }
  return null;
}

/** 목표 문구: 공백 포함 최대 20자. 빈 값은 허용(선택 항목 — null로 저장). */
export function validateGoal(goal: string): string | null {
  if (goal.length > 20) {
    return "목표는 20자까지 쓸 수 있어요";
  }
  return null;
}
