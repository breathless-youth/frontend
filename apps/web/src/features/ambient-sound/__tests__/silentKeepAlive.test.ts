import { describe, expect, it } from "vitest";

import { createSilentKeepAlive, isAppleWebKit } from "../silentKeepAlive";

describe("isAppleWebKit", () => {
  it("vendor 가 Apple 이면 참이다", () => {
    expect(isAppleWebKit({ vendor: "Apple Computer, Inc." })).toBe(true);
  });

  it("다른 엔진이나 navigator 가 없으면 거짓이다", () => {
    expect(isAppleWebKit({ vendor: "Google Inc." })).toBe(false);
    expect(isAppleWebKit(null)).toBe(false);
  });
});

describe("createSilentKeepAlive", () => {
  it("Apple WebKit 에서는 무음 mp3 를 반복 재생하는 audio 요소를 만든다", () => {
    const el = createSilentKeepAlive({ vendor: "Apple Computer, Inc." });
    expect(el).toBeInstanceOf(HTMLAudioElement);
    expect(el?.loop).toBe(true);
  });

  it("다른 엔진에서는 만들지 않는다", () => {
    expect(createSilentKeepAlive({ vendor: "Google Inc." })).toBeNull();
  });
});
