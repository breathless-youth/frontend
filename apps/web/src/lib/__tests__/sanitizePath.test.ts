import { describe, expect, it } from "vitest";

import { sanitizePagePath, sanitizeUrl, UNPARSEABLE_URL } from "../sanitizePath";

/**
 * GA4·Sentry가 공유하는 정제 규칙. 두 소비자를 통한 간접 테스트만 있으면 스킴·호스트 같은
 * 엣지케이스가 빠지므로 여기서 직접 고정한다.
 */

describe("sanitizePagePath", () => {
  it("숫자 세그먼트를 :id로 템플릿화한다", () => {
    expect(sanitizePagePath("/room/42/result", "")).toBe("/room/:id/result");
  });

  it("화이트리스트 밖 쿼리를 버린다", () => {
    expect(sanitizePagePath("/home", "?userId=7&appVersion=1.0.0")).toBe("/home?appVersion=1.0.0");
  });

  it("남길 쿼리가 없으면 경로만 돌려준다", () => {
    expect(sanitizePagePath("/home", "?userId=7")).toBe("/home");
  });
});

describe("sanitizeUrl", () => {
  it("절대 URL은 호스트를 살리고 쿼리를 씻는다", () => {
    expect(sanitizeUrl("https://web.example.com/home?userId=7&detector=on")).toBe(
      "https://web.example.com/home?detector=on",
    );
  });

  it("상대 경로는 상대로 돌려준다 — 브레드크럼 이력 가독성", () => {
    expect(sanitizeUrl("/records?userId=7")).toBe("/records");
  });

  it("프로토콜 상대 URL의 호스트를 잃지 않는다", () => {
    // 스킴은 현재 문서를 따라가므로(테스트 환경은 http) 호스트·경로만 단언한다.
    const result = sanitizeUrl("//other.host/x?userId=7");

    expect(result).toMatch(/^https?:\/\/other\.host\/x$/);
  });

  it.each([
    ["blob:https://web.example.com/abc-123", "blob:"],
    ["data:text/html,<b>hi</b>", "data:"],
    ["about:blank", "about:"],
  ])("http(s)가 아닌 스킴(%s)은 스킴만 남긴다", (raw, expected) => {
    expect(sanitizeUrl(raw)).toBe(expected);
  });

  it("data: URL 본문이 그대로 새어나가지 않는다", () => {
    expect(sanitizeUrl("data:text/plain,userId=7")).not.toContain("userId");
  });

  it("파싱 불가 값은 표식을 남긴다 — 빈 문자열이면 '원래 없었음'과 구분되지 않는다", () => {
    expect(sanitizeUrl("http://[")).toBe(UNPARSEABLE_URL);
  });
});
