import { describe, expect, it, vi } from "vitest";

import { startVideoPlayback } from "../startVideoPlayback";

/**
 * 실패 경로가 핵심이다 — 이 헬퍼는 srcObject를 붙이는 effect 안에서 불리므로,
 * play()가 어떤 방식으로 실패하든 호출부로 전파되면 effect가 함께 죽는다.
 */
describe("startVideoPlayback", () => {
  it("play를 한 번 호출한다", () => {
    const play = vi.fn(() => Promise.resolve());
    startVideoPlayback({ play } as unknown as HTMLVideoElement);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("play의 Promise가 거부돼도(자동재생 정책 거부) 호출부로 전파되지 않는다", async () => {
    const play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));

    expect(() => startVideoPlayback({ play } as unknown as HTMLVideoElement)).not.toThrow();
    // 마이크로태스크를 비워 unhandled rejection이 있으면 vitest가 테스트를 실패시키게 한다.
    await Promise.resolve();
    await Promise.resolve();
  });

  it("play가 동기로 던져도(미구현 환경) 호출부로 전파되지 않는다", () => {
    const play = vi.fn(() => {
      throw new Error("Not implemented");
    });

    expect(() => startVideoPlayback({ play } as unknown as HTMLVideoElement)).not.toThrow();
  });

  it("play가 Promise를 돌려주지 않아도(구식 구현) 안전하다", () => {
    const play = vi.fn(() => undefined);

    expect(() => startVideoPlayback({ play } as unknown as HTMLVideoElement)).not.toThrow();
  });
});
