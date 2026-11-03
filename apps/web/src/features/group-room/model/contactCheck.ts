/** 연락처나 링크가 든 글을 쓰거나 서버가 막았을 때 입력칸 아래에 보이는 문장. */
export const CONTACT_BLOCKED_COPY = "연락처나 링크는 보낼 수 없어요";

// 서버 자바 정규식의 \s는 ASCII 공백 여섯 글자뿐이고 JS의 \s는 줄 구분 문자와 BOM까지 받아서 서버와 같은 글자만 적는다.
// 연락 수단 말과 아이디 사이에는 이 공백과 쌍점, 하이픈을 세 글자까지 둘 수 있다.
const SEP = /[ \t\n\v\f\r:：-]{0,3}/u.source;
// 영문자가 하나는 든 세 글자 이상이라야 아이디로 봐서 `카톡 100명 모임` 같은 숫자는 통과한다.
const ID = /(?=[a-z0-9._]*[a-z])[a-z0-9._]{3,}/u.source;
// dm과 영어 연락 수단 말은 admin이나 install 같은 영어 낱말 속에서, 라인은 가이드라인 같은 한글 낱말 속에서 연락 수단이 아니다.
// 서버는 앞 글자를 lookbehind로 보지만 iOS 16.4 미만 WebKit은 lookbehind가 있으면 이 모듈을 불러오지 못해서 앞 글자까지 함께 맞춘다.
const CONTACT_WORD =
  /(?:카카오톡|카톡|갠톡|오픈채팅|오픈톡|인스타그램|인스타|텔레그램|텔레|디엠|(?:^|[^a-z0-9])dm|(?:^|[^가-힣])라인|디코|디스코드|(?:^|[^a-z0-9])(?:kakaotalk|instagram|insta)(?![a-z0-9]))/u
    .source;
// 카카오는 회사 이름이기도 해서 아이디 표시와 아이디가 바로 뒤에 함께 올 때만 연락 수단으로 본다.
const KAKAO_WITH_LABEL = /(?:카카오|(?:^|[^a-z0-9])kakao(?![a-z0-9]))/u.source;

const CONTACT_PATTERNS: readonly RegExp[] = [
  /https?:\/\/|www\./u,
  // 끝말이 정한 최상위 도메인일 때만 도메인으로 봐서 node.js 같은 글은 통과한다.
  /[\p{L}\p{N}-]+\.(?:com|net|org|kr|co|io|me|ly|gg|so|app|dev|link|site|xyz|info|biz|shop)(?![a-z0-9])/u,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/u,
  // 숫자 사이에 구분자를 한 글자까지만 끼워야 이어진 번호로 봐서 `2026-11-03 - 2027-02-01` 같은 기간은 통과한다.
  /\d(?:[ \t\n\v\f\r.-]?\d){8,}/u,
  // 뒤에 영문자가 없으면 아이디가 아니라서 `@10시 출석`은 통과한다.
  /@(?=[a-z0-9._]*[a-z])[a-z0-9._]{2,}/u,
  new RegExp(`${CONTACT_WORD}${SEP}(?:(?:아이디|id)${SEP})?${ID}`, "u"),
  // id 뒤에 영문자가 이어지면 idea 같은 다른 낱말이다.
  new RegExp(`${KAKAO_WITH_LABEL}${SEP}(?:아이디|id(?![a-z]))${SEP}${ID}`, "u"),
];

/**
 * 연락처·링크 판정
 *
 * 서버 판정 규칙과 같은 정규식이고 서버가 원본이다.
 * lookbehind는 iOS 16.4 미만 WebKit에서 모듈째 깨져 앞 글자 묶음으로 썼다.
 * 화면은 입력하는 동안 같은 규칙으로 안내만 하고 막는 판단은 서버가 한다.
 * 전각 글자와 대문자로 피한 글도 잡도록 서버처럼 NFKC로 맞추고 소문자로 낮춘 뒤 본다.
 */
export function containsContactOrLink(text: string): boolean {
  const normalized = text.normalize("NFKC").toLowerCase();
  return CONTACT_PATTERNS.some((pattern) => pattern.test(normalized));
}
