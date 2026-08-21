import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";

import { initSentry, scrubRecordingEvent, scrubReplayEvent } from "../sentry";

/**
 * Session Replay 계약 가드 (BY-407).
 *
 * 2026-08-20 결정으로 웹에만 리플레이를 켠다 — 앱은 여전히 금지다(전 화면 WebView 셸이라
 * 통째로 마스킹되어 실익이 없음, `apps/mobile/lib/__tests__/sentryConfig.test.ts`).
 * 여기서 고정하는 계약이 깨지면 **조용히** 개인정보가 샌다:
 *
 * - 미디어 차단이 풀리면 카메라 프리뷰가 녹화돼 "카메라 영상은 단말을 벗어나지 않는다"는
 *   원칙(루트 `CLAUDE.md`)이 깨진다.
 * - 리플레이 이벤트는 `beforeSend` 4종을 거치지 않아(`prepareEvent` 경로) 별도 스크러버가
 *   없으면 `?userId=N`이 그대로 나간다.
 */
vi.mock("@sentry/react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    init: vi.fn(),
    addEventProcessor: vi.fn(),
    replayIntegration: vi.fn(() => ({ name: "Replay" })),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function initOptions(): Record<string, unknown> {
  vi.stubEnv("VITE_SENTRY_DSN", "https://key@o0.ingest.example.test/123");
  const init = Sentry.init as unknown as ReturnType<typeof vi.fn>;
  init.mockClear();
  initSentry();
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0] as Record<string, unknown>;
}

describe("initSentry Session Replay 설정", () => {
  it("리플레이 통합을 등록하고 수집률은 일반 세션 10%·에러 세션 100%다", () => {
    const options = initOptions();

    expect(options.replaysSessionSampleRate).toBe(0.1);
    expect(options.replaysOnErrorSampleRate).toBe(1.0);

    const integrations = (options.integrations ?? []) as { name?: string }[];
    expect(integrations.some((integration) => integration.name === "Replay")).toBe(true);
  });

  it("미디어는 전부 차단하고 텍스트는 마스킹하지 않는다 — Amplitude 리플레이와 같은 허용 범위", () => {
    initOptions();

    expect(Sentry.replayIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        blockAllMedia: true,
        maskAllText: false,
        beforeAddRecordingEvent: scrubRecordingEvent,
      }),
    );
  });

  it("리플레이 이벤트 스크러버를 event processor로 등록한다 — beforeSend는 이 경로에 안 불린다", () => {
    initOptions();

    expect(Sentry.addEventProcessor).toHaveBeenCalledWith(scrubReplayEvent);
  });
});

describe("scrubReplayEvent — replay_event 경로", () => {
  it("urls 배열에서 userId를 지우고 화이트리스트 쿼리는 남긴다", () => {
    const event = {
      type: "replay_event",
      urls: ["https://web.example.com/room/3?userId=7&appVersion=1.0.0"],
    } as unknown as Sentry.Event;

    const result = scrubReplayEvent(event) as unknown as { urls: string[] };

    expect(result.urls).toEqual(["https://web.example.com/room/:id?appVersion=1.0.0"]);
  });

  it("request.url도 씻는다", () => {
    const event = {
      type: "replay_event",
      request: { url: "https://web.example.com/home?userId=7" },
    } as unknown as Sentry.Event;

    const result = scrubReplayEvent(event);

    expect(result.request?.url).toBe("https://web.example.com/home");
  });

  it("replay_event가 아닌 이벤트는 건드리지 않는다 — 에러·트랜잭션은 기존 4종 담당", () => {
    const event = {
      request: { url: "https://web.example.com/home?userId=7" },
    } as unknown as Sentry.Event;

    const result = scrubReplayEvent(event);

    expect(result.request?.url).toBe("https://web.example.com/home?userId=7");
  });
});

describe("scrubRecordingEvent — 녹화 페이로드 경로", () => {
  it("rrweb Meta 이벤트의 href를 씻는다 — 세그먼트마다 현재 URL이 원본으로 실린다", () => {
    const event = {
      type: 4,
      data: { href: "https://web.example.com/room/3?userId=7", width: 390, height: 844 },
      timestamp: 1,
    };

    const result = scrubRecordingEvent(event);

    expect((result?.data as { href: string }).href).toBe("https://web.example.com/room/:id");
  });

  it("녹화 내 네비게이션 브레드크럼의 from·to를 씻는다", () => {
    const event = {
      type: 5,
      data: {
        tag: "breadcrumb",
        payload: {
          category: "navigation",
          data: { from: "/home?userId=7", to: "/room/3?userId=7" },
        },
      },
      timestamp: 1,
    };

    const result = scrubRecordingEvent(event);

    const payload = (result?.data as { payload: { data: { from: string; to: string } } }).payload;
    expect(payload.data.from).toBe("/home");
    expect(payload.data.to).toBe("/room/:id");
  });

  it("navigation·resource 성능 스팬의 description을 씻는다 — statsApi가 ?userId=N으로 호출한다", () => {
    const event = {
      type: 5,
      data: {
        tag: "performanceSpan",
        payload: {
          op: "resource.fetch",
          description: "https://api.example.com/api/stats?userId=7&date=2026-08-20",
        },
      },
      timestamp: 1,
    };

    const result = scrubRecordingEvent(event);

    const payload = (result?.data as { payload: { description: string } }).payload;
    expect(payload.description).toBe("https://api.example.com/api/stats");
  });

  it("URL이 아닌 성능 스팬(memory 등)과 DOM 이벤트는 그대로 통과한다", () => {
    const memorySpan = {
      type: 5,
      data: { tag: "performanceSpan", payload: { op: "memory", description: "memory" } },
      timestamp: 1,
    };
    const domEvent = { type: 3, data: { source: 2, positions: [] }, timestamp: 1 };

    expect(scrubRecordingEvent(memorySpan)).toEqual(memorySpan);
    expect(scrubRecordingEvent(domEvent)).toEqual(domEvent);
  });
});
