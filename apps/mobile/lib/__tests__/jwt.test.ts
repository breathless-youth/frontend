import { readUserIdFromAccessToken } from "../jwt";

/** 서버가 주는 모양 그대로 — 헤더·페이로드는 base64url, 서명은 우리가 안 보므로 아무 값이나 둔다. */
function token(payload: object, signature = "sig"): string {
  const b64url = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url(payload)}.${signature}`;
}

describe("readUserIdFromAccessToken", () => {
  it("sub를 사용자 번호로 읽는다 — 서버는 문자열로 준다", () => {
    expect(readUserIdFromAccessToken(token({ sub: "260", iat: 1, exp: 2 }))).toBe(260);
  });

  it("패딩이 필요한 길이도 읽는다", () => {
    // base64 길이가 4의 배수로 안 떨어지는 페이로드를 만들어 패딩 처리를 태운다.
    for (const sub of ["1", "12", "123", "1234", "12345"]) {
      expect(readUserIdFromAccessToken(token({ sub, iat: 1700000000, exp: 1700001800 }))).toBe(
        Number(sub),
      );
    }
  });

  it("서명은 검증하지 않는다 — 저장소에서 꺼낸 값의 번호만 읽는다", () => {
    expect(readUserIdFromAccessToken(token({ sub: "7" }, "obviously-wrong"))).toBe(7);
  });

  it("JWT 모양이 아니면 null", () => {
    expect(readUserIdFromAccessToken("not-a-jwt")).toBeNull();
    expect(readUserIdFromAccessToken("")).toBeNull();
    expect(readUserIdFromAccessToken("a.b")).toBeNull();
    expect(readUserIdFromAccessToken("a.b.c.d")).toBeNull();
  });

  it("페이로드가 base64url이 아니면 null", () => {
    expect(readUserIdFromAccessToken("hdr.!!!not-base64!!!.sig")).toBeNull();
  });

  it("페이로드가 JSON이 아니면 null", () => {
    const notJson = Buffer.from("hello").toString("base64url");
    expect(readUserIdFromAccessToken(`hdr.${notJson}.sig`)).toBeNull();
  });

  it("sub가 없거나 숫자 문자열이 아니면 null — 계약이 바뀐 것이므로 조용히 넘기지 않는다", () => {
    expect(readUserIdFromAccessToken(token({ iat: 1 }))).toBeNull();
    expect(readUserIdFromAccessToken(token({ sub: "abc" }))).toBeNull();
    expect(readUserIdFromAccessToken(token({ sub: "" }))).toBeNull();
    expect(readUserIdFromAccessToken(token({ sub: "-3" }))).toBeNull();
    expect(readUserIdFromAccessToken(token({ sub: "1.5" }))).toBeNull();
    // 숫자로 오면 계약 변화다. 통과시키면 알아채지 못한다.
    expect(readUserIdFromAccessToken(token({ sub: 260 }))).toBeNull();
  });

  it("0이나 안전 정수를 넘는 값은 신원으로 쓰지 않는다", () => {
    expect(readUserIdFromAccessToken(token({ sub: "0" }))).toBeNull();
    expect(readUserIdFromAccessToken(token({ sub: "99999999999999999999" }))).toBeNull();
  });
});
