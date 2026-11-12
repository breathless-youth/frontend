import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetChannelTalkForTests,
  buildChannelProfile,
  startChannelTalk,
  toChannelAppearance,
  toChannelLanguage,
} from "../channelTalk";

const SCRIPT_SELECTOR = 'script[src="https://cdn.channel.io/plugin/ch-plugin-web.js"]';
const OPTIONS = {
  pluginKey: "test-key",
  language: "ko",
  appearance: "system",
  profile: { appVersion: "26.46.0", platform: "web", locale: "ko" },
} as const;

function script() {
  return document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)!;
}

/** 스크립트가 아직 실행되지 않아 공식 스니펫의 큐에 쌓인 SDK 호출 */
function queued(name: string) {
  return ((window.ChannelIO?.q ?? []) as unknown[][]).filter((args) => args[0] === name);
}

function bootCallback(index: number) {
  return queued("boot")[index]![2] as (error: unknown) => void;
}

/** 큐에 쌓인 SDK 호출 이름 목록 */
function callNames() {
  return ((window.ChannelIO?.q ?? []) as unknown[][]).map((args) => args[0]);
}

describe("toChannelLanguage", () => {
  it.each(["ko", "en", "ja"])("%s는 그대로 넘긴다", (locale) => {
    expect(toChannelLanguage(locale)).toBe(locale);
  });
  it("지원하지 않는 언어는 영어로 넘긴다", () => {
    expect(toChannelLanguage("zh-Hant")).toBe("en");
  });
});

describe("toChannelAppearance", () => {
  it("앱 테마가 정해져 있으면 그 값을 쓴다", () => {
    expect(toChannelAppearance("dark")).toBe("dark");
    expect(toChannelAppearance("light")).toBe("light");
  });
  it("앱 테마가 없으면 기기 설정을 따른다", () => {
    expect(toChannelAppearance(undefined)).toBe("system");
  });
});

describe("buildChannelProfile", () => {
  it("네 항목만 담는다", () => {
    expect(
      buildChannelProfile({ appUserId: 42, appVersion: "26.46.0", platform: "ios", locale: "ko" }),
    ).toEqual({ appUserId: 42, appVersion: "26.46.0", platform: "ios", locale: "ko" });
  });
  it("신원이 없으면 appUserId를 넣지 않는다", () => {
    expect(
      buildChannelProfile({
        appUserId: null,
        appVersion: "26.46.0",
        platform: "android",
        locale: "en",
      }),
    ).not.toHaveProperty("appUserId");
  });
});

describe("startChannelTalk", () => {
  afterEach(() => {
    __resetChannelTalkForTests();
    vi.useRealTimers();
  });

  it("스크립트를 받지 못하면 script로 실패한다", async () => {
    const { result } = startChannelTalk(OPTIONS);
    script().dispatchEvent(new Event("error"));

    await expect(result).rejects.toMatchObject({ reason: "script" });
  });

  it("boot 콜백이 오류를 주면 boot로 실패한다", async () => {
    const { result } = startChannelTalk(OPTIONS);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(queued("boot")).toHaveLength(1));
    bootCallback(0)(new Error("invalid plugin key"));

    await expect(result).rejects.toMatchObject({ reason: "boot" });
  });

  it("정해진 시간 안에 boot 콜백이 없으면 boot로 실패한다", async () => {
    vi.useFakeTimers();
    const { result } = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const failed = expect(result).rejects.toMatchObject({ reason: "boot" });
    script().dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(1000);

    await failed;
  });

  it("boot에는 정해진 다섯 옵션만 넘긴다", async () => {
    startChannelTalk(OPTIONS);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(queued("boot")).toHaveLength(1));

    expect(queued("boot")[0]![1]).toEqual({
      pluginKey: "test-key",
      language: "ko",
      appearance: "system",
      profile: OPTIONS.profile,
      hideChannelButtonOnBoot: true,
    });
  });

  it("스크립트가 오기 전에 시간이 지나면 나중에 스크립트가 와도 boot하지 않는다", async () => {
    vi.useFakeTimers();
    const { result } = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const failed = expect(result).rejects.toMatchObject({ reason: "boot" });
    await vi.advanceTimersByTimeAsync(1000);
    await failed;

    script().dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);

    expect(queued("boot")).toHaveLength(0);
  });

  it("boot 중에 시간이 지나면 그 자리에서 끄고 늦은 성공은 무시한다", async () => {
    vi.useFakeTimers();
    const { result } = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const failed = expect(result).rejects.toMatchObject({ reason: "boot" });
    script().dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown"]);

    bootCallback(0)(null);
    await vi.advanceTimersByTimeAsync(0);

    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown"]);
  });

  it("boot 중에 취소하면 콜백을 기다리지 않고 바로 끈다", async () => {
    const { result, cancel } = startChannelTalk(OPTIONS);
    let settled = false;
    result.then(
      () => (settled = true),
      () => (settled = true),
    );
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(queued("boot")).toHaveLength(1));

    cancel();
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown"]);

    // 취소된 시도는 늦게 온 콜백으로 끝나지 않는다.
    bootCallback(0)(null);
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("시간이 지난 뒤 다시 시도하면 새로 boot만 하고 이전 boot의 늦은 성공은 무시한다", async () => {
    vi.useFakeTimers();
    const first = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const failed = expect(first.result).rejects.toMatchObject({ reason: "boot" });
    script().dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown"]);

    const second = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown", "boot"]);

    bootCallback(0)(null);
    bootCallback(1)(null);
    await expect(second.result).resolves.toBeDefined();
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown", "boot"]);
  });

  it("이전 boot가 늦게 성공하고 다음 시도도 실패하면 열린 상담이 남지 않는다", async () => {
    vi.useFakeTimers();
    const first = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const firstFailed = expect(first.result).rejects.toMatchObject({ reason: "boot" });
    script().dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(1000);
    await firstFailed;

    const second = startChannelTalk({ ...OPTIONS, bootTimeoutMs: 1000 });
    const secondFailed = expect(second.result).rejects.toMatchObject({ reason: "boot" });
    await vi.advanceTimersByTimeAsync(0);
    bootCallback(0)(null);
    await vi.advanceTimersByTimeAsync(1000);
    await secondFailed;
    second.cancel();

    expect(queued("shutdown")).toHaveLength(2);
    expect(callNames().at(-1)).toBe("shutdown");
    expect(queued("openChat")).toHaveLength(0);
  });

  it("프로필이 바뀐 다시 시도는 이전 boot를 끈 뒤 새 프로필로 boot한다", async () => {
    startChannelTalk(OPTIONS);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(queued("boot")).toHaveLength(1));

    startChannelTalk({ ...OPTIONS, profile: { ...OPTIONS.profile, appUserId: 42 } });

    await vi.waitFor(() => expect(queued("boot")).toHaveLength(2));
    expect(callNames()).toEqual(["boot", "clearCallbacks", "shutdown", "boot"]);
    expect(queued("boot")[1]![1]).toMatchObject({ profile: { appUserId: 42 } });
  });

  it("다시 시작해도 스크립트는 한 번만 붙이고 boot만 다시 한다", async () => {
    const first = startChannelTalk(OPTIONS);
    script().dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(queued("boot")).toHaveLength(1));
    bootCallback(0)(new Error("invalid plugin key"));
    await first.result.catch(() => {});

    startChannelTalk(OPTIONS);

    await vi.waitFor(() => expect(queued("boot")).toHaveLength(2));
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);
  });
});
