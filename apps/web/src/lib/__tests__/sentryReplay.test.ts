import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";

import {
  initSentry,
  makeScrubbingTransport,
  scrubRecordingEvent,
  scrubReplayEvent,
} from "../sentry";

/**
 * Session Replay 계약 가드. BY-407.
 *
 * 2026-08-20 결정으로 웹에만 리플레이를 켠다. 앱은 전 화면이 WebView 셸이라 통째로
 * 마스킹되어 실익이 없어 여전히 금지다. 앱 쪽 가드는
 * `apps/mobile/lib/__tests__/sentryConfig.test.ts`에 있다.
 * 여기서 고정하는 계약이 깨지면 **조용히** 개인정보가 샌다:
 *
 * - 미디어 차단이 풀리면 카메라 프리뷰가 녹화돼 "카메라 영상은 단말을 벗어나지 않는다"는
 *   루트 `CLAUDE.md`의 원칙이 깨진다.
 * - 리플레이 이벤트는 `prepareEvent` 경로로만 준비되어 `beforeSend` 4종을 거치지 않는다.
 *   별도 스크러버가 없으면 `?userId=N`이 그대로 나간다.
 */
const innerSend = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock("@sentry/react", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    init: vi.fn(),
    addEventProcessor: vi.fn(),
    replayIntegration: vi.fn(() => ({ name: "Replay" })),
    makeFetchTransport: vi.fn(() => ({ send: innerSend, flush: vi.fn() })),
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

  it("미디어는 전부 차단하고 텍스트는 마스킹하지 않는다. Amplitude 리플레이와 같은 허용 범위다", () => {
    initOptions();

    expect(Sentry.replayIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        blockAllMedia: true,
        maskAllText: false,
        beforeAddRecordingEvent: scrubRecordingEvent,
      }),
    );
  });

  it("리플레이 이벤트 스크러버를 event processor로 등록한다. beforeSend는 이 경로에 안 불린다", () => {
    initOptions();

    expect(Sentry.addEventProcessor).toHaveBeenCalledWith(scrubReplayEvent);
  });

  it("압축을 끄고 정제 전송 계층을 붙인다. 녹화 문자열을 전송 직전에 씻기 위한 한 세트다", () => {
    const options = initOptions();

    expect(options.transport).toBe(makeScrubbingTransport);
    expect(Sentry.replayIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ useCompression: false }),
    );
  });

  it("DSN이 없으면 초기화하지 않는다. 로컬·테스트·CI에 영향이 없다", () => {
    const init = Sentry.init as unknown as ReturnType<typeof vi.fn>;
    init.mockClear();
    initSentry();
    expect(init).not.toHaveBeenCalled();
  });
});

describe("makeScrubbingTransport: 전송 직전 최종 방어선", () => {
  /** SDK의 `createReplayEnvelope`·`prepareRecordingData`가 만드는 모양 그대로다. */
  function replayEnvelope(recording: unknown) {
    const length = typeof recording === "string" ? new TextEncoder().encode(recording).length : 100;
    return [
      { event_id: "e1", sent_at: "2026-08-20T00:00:00Z" },
      [
        [{ type: "replay_event" }, { type: "replay_event", urls: ["/home"] }],
        [{ type: "replay_recording", length }, recording],
      ],
    ] as never;
  }

  beforeEach(() => {
    innerSend.mockClear();
  });

  it("녹화 문자열의 userId 파라미터를 지우고 다른 파라미터는 남긴다", async () => {
    // "집중" 같은 비ASCII를 fixture에 넣어 둔다. length 헤더 계산이 문자 수 기준으로
    // 회귀하면 바이트 수와 달라져 이 테스트가 잡는다.
    const recording =
      '{"segment_id":0}\n[{"type":4,"data":{"href":"https://web.example.com/room/3?userId=7&appVersion=1.0.0"}},{"type":5,"data":{"tag":"breadcrumb","payload":{"message":"집중 세션 시작"}}},{"type":5,"data":{"tag":"performanceSpan","payload":{"description":"/api/stats?userId=7"}}}]';
    const transport = makeScrubbingTransport({} as never);

    await transport.send(replayEnvelope(recording));

    expect(innerSend).toHaveBeenCalledTimes(1);
    const sent = (innerSend.mock.calls[0] as unknown[])[0] as [unknown, [unknown, unknown][]];
    const sentRecording = sent[1][1][1] as string;
    expect(sentRecording).not.toContain("userId");
    expect(sentRecording).toContain("?appVersion=1.0.0");
    expect(sentRecording).toContain("/api/stats");

    // envelope 규약: 헤더 length는 payload의 UTF-8 바이트 수다. 정제로 짧아졌는데 갱신하지
    // 않으면 인제스트가 옛 길이만큼 읽어 뒤 아이템까지 잘못 파싱한다.
    const sentHeader = sent[1][1][0] as { length: number };
    expect(sentHeader.length).toBe(new TextEncoder().encode(sentRecording).length);
  });

  it("정제할 수 없는 압축된 녹화면 보내지 않는다. fail-closed 계약이다", async () => {
    const transport = makeScrubbingTransport({} as never);

    await transport.send(replayEnvelope(new Uint8Array([1, 2, 3])));

    expect(innerSend).not.toHaveBeenCalled();
  });

  it("리플레이가 아닌 envelope는 손대지 않고 그대로 보낸다", async () => {
    const envelope = [
      { event_id: "e2" },
      [[{ type: "event" }, { message: "boom", request: { url: "/home?userId=7" } }]],
    ] as never;
    const transport = makeScrubbingTransport({} as never);

    await transport.send(envelope);

    expect(innerSend).toHaveBeenCalledWith(envelope);
  });
});

describe("scrubReplayEvent: replay_event 경로", () => {
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

  it("replay_event가 아닌 이벤트는 건드리지 않는다. 에러·트랜잭션은 기존 4종 담당이다", () => {
    const event = {
      request: { url: "https://web.example.com/home?userId=7" },
    } as unknown as Sentry.Event;

    const result = scrubReplayEvent(event);

    expect(result.request?.url).toBe("https://web.example.com/home?userId=7");
  });
});

describe("scrubRecordingEvent: 녹화 페이로드 경로", () => {
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

  it("navigation·resource 성능 스팬의 description을 씻는다. statsApi가 ?userId=N으로 호출한다", () => {
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

  it("navigation.push 스팬의 data.previous(이전 URL)도 씻는다", () => {
    const event = {
      type: 5,
      data: {
        tag: "performanceSpan",
        payload: {
          op: "navigation.push",
          description: "/room/3?userId=7",
          data: { previous: "/home?userId=7" },
        },
      },
      timestamp: 1,
    };

    const result = scrubRecordingEvent(event);

    const payload = (
      result?.data as { payload: { description: string; data: { previous: string } } }
    ).payload;
    expect(payload.description).toBe("/room/:id");
    expect(payload.data.previous).toBe("/home");
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
