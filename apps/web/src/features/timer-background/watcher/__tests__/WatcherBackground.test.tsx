import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WatcherBackground, WatcherDemo } from "../WatcherBackground";

const KEY = "watcher/9c8d9f19";
const stored = vi.hoisted(() => ({ loopAMissing: false }));

vi.mock("../watcherAssets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readWatcherAsset: vi.fn(async (url: string) =>
    stored.loopAMissing && url.includes("/loop-a/") ? "missing" : null,
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom은 영상을 재생하지 못해 play()가 재생 시작 신호만 내게 한다.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  stored.loopAMissing = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 화면을 넘긴 뒤 쉬는 요소가 다음 클립을 받을 때까지 */
function settle() {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

function setup() {
  const view = render(<WatcherBackground assetKey={KEY} present={false} />);
  const videos = () => [...view.container.querySelectorAll("video")];
  const shown = () => videos().filter((video) => video.className.includes("opacity-100"));
  return { ...view, videos, shown };
}

describe("WatcherBackground", () => {
  it("재생이 막히면 1초 간격으로 그 자리에서 다시 재생한다", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const succeed = play.getMockImplementation()!;
    let failures = 2;
    play.mockImplementation(function (this: HTMLMediaElement) {
      if (failures-- > 0) return Promise.reject(new Error("blocked"));
      return succeed.call(this);
    });
    const { rerender, videos, shown } = setup();

    rerender(<WatcherBackground assetKey={KEY} present />);
    act(() => {
      videos()[0]!.currentTime = 1.5;
    });
    expect(shown()).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    expect(shown()).toEqual([videos()[0]]);
    expect(videos()[0]!.currentTime).toBe(1.5);
  });

  it("3번 다시 시도해도 막히면 빈 방으로 돌아가고, 다음에 들어올 때 다시 재생한다", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const succeed = play.getMockImplementation()!;
    play.mockImplementation(() => Promise.reject(new Error("blocked")));
    const onClipStart = vi.fn();
    const view = render(
      <WatcherBackground assetKey={KEY} present={false} onClipStart={onClipStart} />,
    );

    view.rerender(<WatcherBackground assetKey={KEY} present onClipStart={onClipStart} />);
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    expect(play).toHaveBeenCalledTimes(4);
    expect(onClipStart).toHaveBeenLastCalledWith(null);

    play.mockImplementation(succeed);
    view.rerender(<WatcherBackground assetKey={KEY} present={false} onClipStart={onClipStart} />);
    view.rerender(<WatcherBackground assetKey={KEY} present onClipStart={onClipStart} />);
    expect(onClipStart).toHaveBeenLastCalledWith("enter");
  });

  it("평소에는 빈 방만 보이고 영상은 숨어 있다", () => {
    const { container, shown } = setup();

    // 빈 방은 enter 첫 프레임이라 화면 방향·크기별로 따로 있다.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/spaces/watcher/9c8d9f19/poster/phone_portrait.jpg",
    );
    expect(container.querySelector('source[media="(orientation: landscape)"]')).toHaveAttribute(
      "srcset",
      "/spaces/watcher/9c8d9f19/poster/phone_landscape.jpg",
    );
    expect(shown()).toHaveLength(0);
  });

  it("등장하면 enter를 재생하고, 끝나면 다른 영상 요소에서 루프를 이어 재생한다", () => {
    const { rerender, videos, shown } = setup();

    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    const [first, second] = videos();
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/enter/");
    expect(shown()).toEqual([first]);
    // 쉬는 요소는 다음 루프를 미리 받아 둔다.
    expect(second!.src).toContain("/spaces/watcher/9c8d9f19/loop-a/");

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toEqual([second]);
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/loop-b/");

    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(shown()).toEqual([first]);
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/loop-b/");
  });

  it("집중으로 돌아오면 지금 루프를 끝까지 재생한 뒤 퇴장하고, 퇴장이 끝나면 빈 방으로 돌아간다", () => {
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    const [first, second] = videos();
    act(() => {
      fireEvent.ended(first!);
    });
    settle();

    rerender(<WatcherBackground assetKey={KEY} present={false} />);
    settle();
    // 루프 중간에는 바꾸지 않는다.
    expect(shown()).toEqual([second]);

    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/exit/");
    expect(shown()).toEqual([first]);

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toHaveLength(0);
  });

  it("퇴장 중에 다시 비집중이면 퇴장이 끝나는 대로 다시 들어온다", () => {
    const { rerender, videos } = setup();
    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    const [first, second] = videos();
    rerender(<WatcherBackground assetKey={KEY} present={false} />);
    settle();
    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(second!.src).toContain("/spaces/watcher/9c8d9f19/exit/");

    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    act(() => {
      fireEvent.ended(second!);
    });
    settle();

    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/enter/");
  });

  it("loop-a가 없는 공간은 들어온 뒤 loop-b만 이어 반복한다", async () => {
    stored.loopAMissing = true;
    const { rerender, videos } = setup();
    // 받아 둔 기록을 읽어 loop-a가 없다는 것을 안다.
    await act(async () => {});

    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    const [first, second] = videos();
    expect(second!.src).toContain(`/spaces/${KEY}/loop-b/`);

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(first!.src).toContain(`/spaces/${KEY}/loop-b/`);
  });

  it("빈 방 포스터는 그 공간 폴더에서 고른다", () => {
    const { container } = setup();

    expect(container.querySelector("img")!.src).toContain(
      `/spaces/${KEY}/poster/phone_portrait.jpg`,
    );
    expect(container.querySelector("source")!.getAttribute("srcset")).toBe(
      `/spaces/${KEY}/poster/tablet_landscape.jpg`,
    );
  });
});

describe("WatcherBackground — 루프 B 중 퇴장", () => {
  it("가만히 서 있는 루프 B 중에 나가야 하면 끝까지 기다리지 않고 바로 퇴장한다", () => {
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground assetKey={KEY} present />);
    settle();
    const [first, second] = videos();
    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(first!.src).toContain("/loop-b/");
    expect(shown()).toEqual([first]);

    rerender(<WatcherBackground assetKey={KEY} present={false} />);

    expect(second!.src).toContain("/exit/");
    expect(shown()).toEqual([second]);
  });
});

describe("WatcherBackground — 이음매", () => {
  it("다음 클립이 재생되기 전까지 앞 요소의 영상을 바꾸지 않는다", () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => Promise.resolve());
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground assetKey={KEY} present />);
    const [first, second] = videos();
    act(() => {
      fireEvent.playing(first!);
    });
    settle();

    act(() => {
      fireEvent.ended(first!);
    });
    rerender(<WatcherBackground assetKey={KEY} present={false} />);
    settle();

    // 다음 요소가 아직 재생을 시작하지 않아 앞 요소의 마지막 프레임이 그대로 보인다.
    expect(shown()).toEqual([first]);
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/enter/");

    act(() => {
      fireEvent.playing(second!);
    });
    settle();
    expect(shown()).toEqual([second]);
    expect(first!.src).toContain("/spaces/watcher/9c8d9f19/exit/");
  });
});

describe("WatcherDemo", () => {
  it("들어와 시계를 한 번 보고 나간 뒤, 빈 방 2초 뒤에 다시 들어온다", () => {
    const view = render(<WatcherDemo assetKey={KEY} />);
    const videos = () => [...view.container.querySelectorAll("video")];
    const shown = () => videos().filter((video) => video.className.includes("opacity-100"));
    settle();
    const [first, second] = videos();
    expect(shown()).toEqual([first]);
    expect(first!.src).toContain("/enter/");

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toEqual([second]);
    expect(second!.src).toContain("/loop-a/");
    // 시계를 보는 동안 다음은 퇴장으로 받아 둔다.
    expect(first!.src).toContain("/exit/");

    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(shown()).toEqual([first]);
    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    settle();
    expect(shown()).toHaveLength(1);
    expect(shown()[0]!.src).toContain("/enter/");
  });

  it("loop-a가 없으면 loop-b에 들어서자마자 나간다", async () => {
    stored.loopAMissing = true;
    const view = render(<WatcherDemo assetKey={KEY} />);
    await act(async () => {});
    settle();
    const videos = () => [...view.container.querySelectorAll("video")];

    act(() => {
      fireEvent.ended(videos().find((video) => video.src.includes("/enter/"))!);
    });
    settle();

    expect(videos().some((video) => video.src.includes("/exit/"))).toBe(true);
  });
});
