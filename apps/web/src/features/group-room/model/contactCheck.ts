/** 연락처나 링크가 든 글을 쓰거나 서버가 막았을 때 입력칸 아래에 보이는 문장. */
export const CONTACT_BLOCKED_COPY = "연락처나 링크는 보낼 수 없어요";

/** 명세의 `.com`, `.kr` 꼴을 흔한 단축 주소 끝말까지 넓힌 목록. */
const DOMAIN_ENDINGS = [
  "com",
  "net",
  "org",
  "kr",
  "io",
  "me",
  "co",
  "ly",
  "gg",
  "to",
  "app",
  "xyz",
  "link",
  "site",
  "info",
  "biz",
];

/**
 * 연락 수단을 부르는 말
 *
 * 앞의 다섯 말은 명세에 있는 그대로 쓰고 뒤는 흔한 다른 이름을 더한 것이다.
 * 더한 이름 가운데 짧은 `dm`, `텔레`, `디코`는 공부 글의 낱말 안에서 걸리지 않게 앞뒤 글자를 본다.
 * `dm`은 `admission` 안에, `텔레`와 `디코`는 `텔레비전`과 `디코딩` 안에 들어 있다.
 */
const CONTACT_WORDS = [
  "카톡",
  "오픈채팅",
  "인스타",
  "텔레그램",
  "디엠",
  "카카오톡",
  "오픈톡",
  "인스타그램",
  "디스코드",
  "(?<![a-z])dm",
  "텔레(?!\\p{Script=Hangul})",
  "디코(?!\\p{Script=Hangul})",
];

const CONTACT_PATTERNS: readonly RegExp[] = [
  /https?:\/\/|www\./i,
  // 끝말 뒤에 영문·숫자가 이어지면 `.coding`처럼 다른 낱말이라 도메인으로 보지 않는다.
  new RegExp(`[a-z0-9-]+\\.(?:${DOMAIN_ENDINGS.join("|")})(?![a-z0-9])`, "i"),
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  // 숫자 사이의 `-`와 띄어쓰기는 이어진 것으로 봐서 전화번호를 띄워 써도 걸린다.
  /\d(?:[\s-]*\d){8,}/,
  // 영문·숫자 바로 뒤의 `@`는 아이디가 아니라 이메일의 일부라서 위 규칙이 맡는다.
  /(?<![a-z0-9])@[a-z0-9._]{2,}/i,
  // 말 뒤 여섯 글자 안에 아이디 꼴이 오면 연락처를 남긴 것으로 본다.
  // 말줄임표처럼 문장부호만 이어진 글은 아이디가 아니라서 영문이나 숫자가 하나는 있어야 한다.
  new RegExp(`(?:${CONTACT_WORDS.join("|")})[^a-z0-9]{0,6}(?=[._-]*[a-z0-9])[a-z0-9._-]{3,}`, "iu"),
];

/**
 * 연락처·링크 판정
 *
 * 판정의 원본은 서버이고 화면은 같은 규칙으로 입력하는 동안 안내만 한다.
 * 전각 글자로 피한 글도 잡도록 NFKC로 반각에 맞춘 뒤 본다.
 */
export function containsContactOrLink(text: string): boolean {
  const normalized = text.normalize("NFKC");
  return CONTACT_PATTERNS.some((pattern) => pattern.test(normalized));
}
