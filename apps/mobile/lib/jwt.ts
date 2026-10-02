/**
 * access JWT에서 신원(`sub`)만 읽는다.
 *
 * 등록 응답(`POST /api/users`)에 더 이상 `userId`가 없어서 신원의 유일한 출처가 이 클레임이다(BY-723).
 * 서명은 **검증하지 않는다** — 토큰은 우리 저장소에서 바로 꺼낸 것이고, 위조 여부는 서버가 매 요청마다
 * 판단한다. 여기서 하는 일은 우리가 방금 받은 값에서 번호를 꺼내는 것뿐이다.
 *
 * React Native에는 `atob`도 `Buffer`도 없어서 base64url 디코딩을 직접 한다. 페이로드는 `sub`·`iat`·`exp`
 * 뿐이라 전부 ASCII다(개인정보 클레임은 싣지 않는다 — ADR 0008). 그래서 바이트를 그대로 문자로 읽는다.
 */

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64url 한 덩이를 ASCII 문자열로. 형식이 어긋나면 null. */
function decodeBase64UrlAscii(segment: string): string | null {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (base64.length % 4)) % 4;
  // base64는 4의 배수로만 떨어진다. 나머지가 1이면 어떤 입력으로도 만들어질 수 없는 길이다.
  if (base64.length % 4 === 1) return null;
  const padded = base64 + "=".repeat(padding);

  let out = "";
  for (let i = 0; i < padded.length; i += 4) {
    const quad = [0, 1, 2, 3].map((k) => {
      const char = padded[i + k]!;
      return char === "=" ? 0 : B64_ALPHABET.indexOf(char);
    });
    if (quad.some((value) => value < 0)) return null;
    const bits = (quad[0]! << 18) | (quad[1]! << 12) | (quad[2]! << 6) | quad[3]!;
    const pad = padded[i + 2] === "=" ? 2 : padded[i + 3] === "=" ? 1 : 0;
    out += String.fromCharCode((bits >> 16) & 0xff);
    if (pad < 2) out += String.fromCharCode((bits >> 8) & 0xff);
    if (pad < 1) out += String.fromCharCode(bits & 0xff);
  }
  return out;
}

/**
 * access 토큰의 `sub`를 사용자 번호로 돌려준다. 읽을 수 없으면 null —
 * 호출부는 이것을 **등록 실패**로 다룬다. 신원 없이 저장을 만들면 웹이 조용히 브라우저 단독 모드가 된다.
 *
 * 서버는 `sub`를 문자열로 준다(`"260"`). 숫자로 안 떨어지면 계약이 바뀐 것이므로 null이다.
 */
export function readUserIdFromAccessToken(accessToken: string): number | null {
  const segments = accessToken.split(".");
  if (segments.length !== 3) return null;

  const json = decodeBase64UrlAscii(segments[1]!);
  if (json === null) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof claims !== "object" || claims === null) return null;

  const sub = (claims as { sub?: unknown }).sub;
  // 문자열만 받는다. 서버가 숫자로 바꿔 보내도 통과시키면 계약 변화를 못 알아챈다.
  if (typeof sub !== "string" || !/^\d+$/.test(sub)) return null;

  const userId = Number(sub);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}
