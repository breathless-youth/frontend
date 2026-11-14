import { afterEach, expect, it, vi } from "vitest";

vi.mock("@amplitude/engagement-browser", () => ({
  plugin: () => ({
    name: "@amplitude/engagement-browser",
    type: "enrichment",
    execute: async (event: unknown) => event,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

it("실제 SDK가 재순공을 사용자·중복 방지 ID와 함께 한 번 전송한다", async () => {
  localStorage.clear();
  window.history.replaceState({}, "", "/home?userId=7");
  vi.stubEnv("VITE_AMPLITUDE_API_KEY", "test-key");
  vi.stubGlobal("requestIdleCallback", () => 1);
  const sent: Array<{ events: Array<Record<string, unknown>> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options?: { body?: string }) => {
      if (options?.body) sent.push(JSON.parse(options.body) as (typeof sent)[number]);
      const body = { code: 200, events_ingested: 1 };
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      });
    }),
  );

  const m = await import("../amplitude");
  const amplitude = await import("@amplitude/analytics-browser");
  m.initAmplitude();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vi.dynamicImportSettled();
  m.setAmplitudeUserId(7);

  const onboardedAt = Date.parse("2026-11-06T10:00:00+09:00");
  const now = vi.spyOn(Date, "now").mockReturnValue(onboardedAt);
  m.trackOnboardingCompleted();
  const ended = {
    startedAtMs: onboardedAt,
    roomType: "single",
    studySec: 300,
    focusSec: 300,
    pauseSec: 0,
    distractionSec: 0,
    endReason: "MANUAL",
    pauseTrigger: null,
    willSubmit: true,
  } as const;
  now.mockReturnValue(onboardedAt + 300_000);
  m.trackStudySessionEnded(ended);
  const repeatedAt = Date.parse("2026-11-07T00:00:00+09:00");
  now.mockReturnValue(repeatedAt);
  m.trackStudySessionEnded({ ...ended, startedAtMs: repeatedAt - 300_000 });
  m.trackStudySessionEnded({ ...ended, startedAtMs: repeatedAt - 300_000 });
  await amplitude.flush().promise;

  const events = sent.flatMap((batch) => batch.events);
  const repeated = events.filter((event) => event.event_type === "onboarding_week_study_repeated");
  expect(repeated).toHaveLength(1);
  expect(repeated[0]).toMatchObject({
    user_id: "7",
    time: repeatedAt,
    insert_id: expect.any(String),
    event_properties: { repeat_tracking_version: 1 },
  });
  const onboarding = events.find((event) => event.event_type === "onboarding_completed");
  expect(onboarding).toMatchObject({
    user_id: "7",
    time: onboardedAt,
    event_properties: { repeat_tracking_version: 1 },
  });
  expect(Object.keys(repeated[0]!.event_properties as object)).toEqual(["repeat_tracking_version"]);
  expect(events.filter((event) => event.event_type === "study_session_ended")).toHaveLength(3);
  now.mockRestore();
});
