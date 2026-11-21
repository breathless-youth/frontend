import { describe, expect, it } from "vitest";

import { canLeaveMidClip, nextWatcherClip } from "../watcherClips";

describe("canLeaveMidClip", () => {
  it("가만히 서 있는 루프 B만 중간에 퇴장으로 넘어갈 수 있다", () => {
    expect(canLeaveMidClip("loop-b")).toBe(true);
    expect(canLeaveMidClip("loop-a")).toBe(false);
    expect(canLeaveMidClip("enter")).toBe(false);
    expect(canLeaveMidClip("exit")).toBe(false);
  });
});

describe("nextWatcherClip", () => {
  it("비집중이 이어지면 들어온 뒤 두 루프를 번갈아 재생한다", () => {
    expect(nextWatcherClip("enter", true)).toBe("loop-a");
    expect(nextWatcherClip("loop-a", true)).toBe("loop-b");
    expect(nextWatcherClip("loop-b", true)).toBe("loop-a");
  });

  it("집중으로 돌아오면 지금 클립을 끝낸 뒤 퇴장한다", () => {
    expect(nextWatcherClip("enter", false)).toBe("exit");
    expect(nextWatcherClip("loop-a", false)).toBe("exit");
    expect(nextWatcherClip("loop-b", false)).toBe("exit");
  });

  it("퇴장이 끝날 때 다시 비집중이면 곧바로 다시 들어오고, 아니면 빈 방으로 멈춘다", () => {
    expect(nextWatcherClip("exit", true)).toBe("enter");
    expect(nextWatcherClip("exit", false)).toBeNull();
  });

  it("loop-a가 없으면 들어온 뒤 loop-b만 반복한다", () => {
    expect(nextWatcherClip("enter", true, false)).toBe("loop-b");
    expect(nextWatcherClip("loop-b", true, false)).toBe("loop-b");
    expect(nextWatcherClip("loop-b", false, false)).toBe("exit");
  });
});
