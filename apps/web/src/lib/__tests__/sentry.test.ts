import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

import { scrubEvent, scrubBreadcrumb } from "../sentry";

/**
 * 이 파일이 지키는 계약은 하나다: **`?userId=N`이 Sentry로 나가지 않는다.**
 *
 * 웹뷰가 모든 탭을 `?userId=N`으로 열기 때문에(네이티브 셸 계약) 기본 설정 그대로 두면
 * 익명 기기 계정 ID가 제3자로 흘러간다. `sendDefaultPii: false`는 쿠키·IP만 막을 뿐
 * 쿼리스트링을 건드리지 않아서 이 가드가 필요하다 — GA4에 이미 같은 규칙이 걸려 있다.
 */

const event = (partial: Partial<ErrorEvent>): ErrorEvent => partial as ErrorEvent;

describe("scrubEvent", () => {
  it("request.url에서 userId를 지우고 화이트리스트만 남긴다", () => {
    const result = scrubEvent(
      event({ request: { url: "https://web.example.com/home?userId=7&appVersion=1.0.0" } }),
    );

    expect(result.request?.url).toBe("https://web.example.com/home?appVersion=1.0.0");
  });

  it("트랜잭션 이름의 숫자 세그먼트를 :id로 템플릿화한다", () => {
    const result = scrubEvent(event({ transaction: "/room/42/result?userId=7" }));

    expect(result.transaction).toBe("/room/:id/result");
  });

  it("쿼리가 없는 트랜잭션은 경로만 정제한다", () => {
    expect(scrubEvent(event({ transaction: "/room/42" })).transaction).toBe("/room/:id");
  });

  it("url·transaction이 없어도 그대로 통과시킨다", () => {
    expect(() => scrubEvent(event({}))).not.toThrow();
  });
});

describe("scrubBreadcrumb", () => {
  it("네비게이션 from·to의 식별자를 지우고 이동 이력은 남긴다", () => {
    const result = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/home?userId=7", to: "/records?userId=7" },
    } as Breadcrumb);

    expect(result.data).toEqual({ from: "/home", to: "/records" });
  });

  it("fetch 브레드크럼의 url도 정제한다", () => {
    const result = scrubBreadcrumb({
      category: "fetch",
      data: { url: "https://api.example.com/api/stats?userId=7&date=2026-08-07" },
    } as Breadcrumb);

    expect(result.data?.url).toBe("https://api.example.com/api/stats");
  });

  it("data가 없는 브레드크럼은 그대로 둔다", () => {
    const breadcrumb = { category: "console", message: "hi" } as Breadcrumb;

    expect(scrubBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});
