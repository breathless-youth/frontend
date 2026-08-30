import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **실제 Amplitude SDK를 mock 없이 돌려 최종 전송 payload를 검사한다.**
 *
 * `amplitude.test.ts`는 SDK를 mock해서 "우리가 무엇을 호출했는가"만 본다. 그것만으로는
 * 2026-08-09에 실제로 있었던 누수를 못 잡는다 — `add()`를 `init()`보다 먼저 불러도 우리
 * enrichment 플러그인은 **가장 먼저** 실행되고, SDK 내부 플러그인(`pageUrlEnrichment`와
 * attribution의 `eventProperty` 모드)이 **그 뒤에** 원본 `location.href`·`document.referrer`를
 * 덧붙여서 정제를 통째로 우회했다. 호출 순서 검증은 전부 통과하는데 나가는 payload에는
 * `?userId=N`이 그대로 실려 있었다.
 *
 * 그래서 이 파일은 fetch를 가로채 **네트워크로 나가는 body**를 직접 본다. SDK 버전을 올리다
 * 플러그인 실행 순서나 autocapture 기본값이 바뀌면 여기서 깨진다.
 *
 * ⚠️ **테스트를 쪼개지 말 것.** `@amplitude/analytics-browser`는 모듈 수준 싱글턴이라
 * `vi.resetModules()`로도 클라이언트 인스턴스가 초기화되지 않는다. `initAmplitude()`를 두 번
 * 부르면 두 번째는 이미 등록된 플러그인·세션 상태를 물려받아 순서 의존적으로 깨진다.
 * 초기화는 파일당 한 번이고, 단언은 이 테스트 안에서 모두 한다.
 */

/**
 * Guides & Surveys SDK만 no-op으로 대체한다 — "실제 SDK" 원칙의 유일한 예외.
 *
 * npm 패키지가 로더라서다: `plugin().setup()`이 CDN 번들 로드를 기다리는 `boot`를 await하는데,
 * jsdom은 외부 `<script>`를 로드하지 않아 SDK 자체 타임아웃(10초)까지 초기화 체인 전체가
 * 멈춘다 — 이 테스트의 flush 시점에는 한 건도 전송되지 않아 첫 단언에서 깨진다. 설문 렌더러는
 * 통째로 원격 코드라, 이 테스트가 검증하는 전송 payload에 기여하는 로컬 코드도 없다.
 */
vi.mock("@amplitude/engagement-browser", () => ({
  plugin: () => ({
    name: "@amplitude/engagement-browser",
    type: "enrichment",
    execute: async (event: unknown) => event,
  }),
}));

const sent: { events: Record<string, unknown>[]; options?: { min_id_length?: number } }[] = [];

beforeEach(() => {
  sent.length = 0;
  // 네이티브 셸 계약: 모든 탭이 `?userId=N`으로 열린다. 전체 네비게이션이면 referrer에도 남는다.
  window.history.replaceState({}, "", "/room/42?userId=7&appVersion=1.0.0");
  Object.defineProperty(document, "referrer", {
    value: `${window.location.origin}/home?userId=7`,
    configurable: true,
  });
  vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { body?: string }) => {
      if (init?.body) sent.push(JSON.parse(init.body) as (typeof sent)[number]);
      const payload = {
        code: 200,
        events_ingested: 1,
        payload_size_bytes: 1,
        server_upload_time: 1,
      };
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(payload)),
        json: () => Promise.resolve(payload),
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** 이벤트 루프를 한 바퀴 돌려 SDK의 비동기 init·큐 처리를 진행시킨다. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Amplitude 전송 파이프라인 (실제 SDK)", () => {
  it("나가는 payload 어디에도 userId가 남지 않는다", async () => {
    const { initAmplitude, trackAmplitudePageView, trackStudySessionStarted } =
      await import("../amplitude");
    const amplitude = await import("@amplitude/analytics-browser");

    initAmplitude();
    // init은 비동기다 — 끝나기 전에 track하면 큐에만 쌓이고 아직 파이프라인을 안 탄다.
    await tick();

    trackAmplitudePageView("/room/42", "?userId=7&appVersion=1.0.0");
    trackStudySessionStarted("single");
    await amplitude.flush().promise;
    await tick();

    const events = sent.flatMap((batch) => batch.events);
    const body = JSON.stringify(sent);

    // 0건이면 아래 단언이 전부 공허하게 통과한다 — 먼저 실제 전송을 확인한다.
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["[Amplitude] Page Viewed", "study_session_started"]),
    );

    // 핵심 단언 — 어떤 이벤트에도 셸이 붙인 식별자가 실리지 않는다.
    expect(body).not.toContain("userId");

    // 숫자 경로가 남으면 같은 화면이 세션 수만큼 쪼개져 차트에서 묶이지 않는다.
    expect(body).toContain("/room/:id");
    expect(body).not.toContain("/room/42");

    // attribution의 userProperty 모드가 만드는 Identify 이벤트가 실제 누수 경로였다
    // (`$setOnce.initial_referrer` / `$set.referrer`에 `document.referrer` 원본이 담긴다).
    const identify = events.find((event) => event.event_type === "$identify");
    if (identify) {
      expect(JSON.stringify(identify)).not.toContain("userId");
    }

    // user_id는 URL이 아니라 제 자리(`user_id` 필드)로 나간다.
    expect(events.every((event) => event.user_id === "7")).toBe(true);

    // "7"은 1자다 — 요청에 `min_id_length`를 싣지 않으면 Amplitude 인제스트가 기본 최소
    // 길이(5자) 미달로 user_id를 제거해, 위 단언이 통과해도 콘솔에는 전원이 익명으로 남는다.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((batch) => batch.options?.min_id_length === 1)).toBe(true);
  });
});
