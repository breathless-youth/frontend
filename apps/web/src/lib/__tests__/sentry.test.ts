import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";

import { scrubBreadcrumb, scrubEvent, scrubSpan } from "../sentry";
import type { SpanJSON, TransactionEvent } from "../sentry";

/**
 * 이 파일이 지키는 계약은 하나다: **`?userId=N`이 Sentry로 나가지 않는다.**
 *
 * 웹뷰가 모든 탭을 `?userId=N`으로 열기 때문에(네이티브 셸 계약) 기본 설정 그대로 두면
 * 익명 기기 계정 ID가 제3자로 흘러간다. `sendDefaultPii: false`는 쿠키·IP만 막을 뿐
 * 쿼리스트링을 건드리지 않아서 이 가드가 필요하다.
 *
 * **에러 경로만 막으면 계약이 깨진다** — `beforeSend`는 SDK 구현상 에러 이벤트에서만
 * 호출되고, 트레이스가 켜져 있으면 트랜잭션 이벤트와 스팬으로도 같은 URL이 나간다.
 * 그래서 세 경로(에러·트랜잭션·스팬) + 브레드크럼을 모두 고정한다.
 */

const errorEvent = (partial: Partial<ErrorEvent>): ErrorEvent => partial as ErrorEvent;
const txEvent = (partial: Partial<TransactionEvent>): TransactionEvent =>
  partial as TransactionEvent;

describe("scrubEvent — 에러 이벤트", () => {
  it("request.url에서 userId를 지우고 화이트리스트만 남긴다", () => {
    const result = scrubEvent(
      errorEvent({ request: { url: "https://web.example.com/home?userId=7&appVersion=1.0.0" } }),
    );

    expect(result.request?.url).toBe("https://web.example.com/home?appVersion=1.0.0");
  });

  it("Referer 헤더도 씻는다 — httpContext가 document.referrer를 그대로 넣는다", () => {
    const result = scrubEvent(
      errorEvent({
        request: {
          url: "https://web.example.com/records",
          headers: { Referer: "https://web.example.com/home?userId=7" },
        },
      }),
    );

    expect(result.request?.headers?.Referer).toBe("https://web.example.com/home");
  });

  it("트랜잭션 이름의 숫자 세그먼트를 :id로 템플릿화한다", () => {
    expect(scrubEvent(errorEvent({ transaction: "/room/42/result?userId=7" })).transaction).toBe(
      "/room/:id/result",
    );
  });

  it("이미 라우트 패턴이면 그대로 통과한다(멱등)", () => {
    expect(scrubEvent(errorEvent({ transaction: "/room/:id" })).transaction).toBe("/room/:id");
  });

  it("url·transaction이 없으면 이벤트를 바꾸지 않는다", () => {
    const event = errorEvent({ message: "boom" });

    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });
});

describe("scrubEvent — 트랜잭션 이벤트", () => {
  /**
   * 회귀 가드: `beforeSend`만 걸면 이 경로가 통째로 새고, 그 상태로도 에러 테스트는 전부
   * 통과한다. `beforeSendTransaction`이 빠지면 여기서 잡힌다.
   */
  it("트랜잭션 이벤트의 request.url도 씻는다", () => {
    const result = scrubEvent(
      txEvent({
        type: "transaction",
        request: { url: "https://web.example.com/home?userId=7" },
        transaction: "/home?userId=7",
      }),
    );

    expect(result.request?.url).toBe("https://web.example.com/home");
    expect(result.transaction).toBe("/home");
  });
});

describe("scrubSpan", () => {
  /**
   * 가장 직접적인 유출 경로. `getFetchSpanAttributes`가 `http.query`에 원본 쿼리를 넣고,
   * `statsApi.ts`가 `/api/stats?userId=N&date=...`으로 호출한다.
   */
  it("fetch 스팬의 http.query를 통째로 버린다", () => {
    const result = scrubSpan({
      data: {
        url: "https://api.example.com/api/stats?userId=7&date=2026-08-07",
        "http.query": "?userId=7&date=2026-08-07",
      },
    } as unknown as SpanJSON);

    expect(result.data?.["http.query"]).toBeUndefined();
    expect(result.data?.url).toBe("https://api.example.com/api/stats");
  });

  it("url·http.url·url.full·referer 속성을 모두 씻는다", () => {
    const result = scrubSpan({
      data: {
        url: "/home?userId=7",
        "http.url": "https://web.example.com/home?userId=7",
        "url.full": "https://web.example.com/home?userId=7",
        "http.request.header.referer": "https://web.example.com/records?userId=7",
      },
    } as unknown as SpanJSON);

    expect(JSON.stringify(result.data)).not.toContain("userId");
  });

  it("data가 없는 스팬은 그대로 둔다", () => {
    const span = { description: "GET /api/stats" } as unknown as SpanJSON;

    expect(scrubSpan(span)).toBe(span);
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
