import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WatcherBackground, WatcherDemo } from "../WatcherBackground";

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
  const view = render(<WatcherBackground present={false} />);
  const videos = () => [...view.container.querySelectorAll("video")];
  const shown = () => videos().filter((video) => video.className.includes("opacity-100"));
  return { ...view, videos, shown };
}

describe("WatcherBackground", () => {
  it("평소에는 빈 방만 보이고 영상은 숨어 있다", () => {
    const { container, shown } = setup();

    // 빈 방은 enter 첫 프레임이라 화면 방향·크기별로 따로 있다.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/watcher/1d51e502/poster/phone_portrait.jpg",
    );
    expect(container.querySelector('source[media="(orientation: landscape)"]')).toHaveAttribute(
      "srcset",
      "/watcher/1d51e502/poster/phone_landscape.jpg",
    );
    expect(shown()).toHaveLength(0);
  });

  it("등장하면 enter를 재생하고, 끝나면 다른 영상 요소에서 루프를 이어 재생한다", () => {
    const { rerender, videos, shown } = setup();

    rerender(<WatcherBackground present />);
    settle();
    const [first, second] = videos();
    expect(first!.src).toContain("/watcher/1d51e502/enter/");
    expect(shown()).toEqual([first]);
    // 쉬는 요소는 다음 루프를 미리 받아 둔다.
    expect(second!.src).toContain("/watcher/1d51e502/loop-a/");

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toEqual([second]);
    expect(first!.src).toContain("/watcher/1d51e502/loop-b/");

    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(shown()).toEqual([first]);
    expect(first!.src).toContain("/watcher/1d51e502/loop-b/");
  });

  it("집중으로 돌아오면 지금 루프를 끝까지 재생한 뒤 퇴장하고, 퇴장이 끝나면 빈 방으로 돌아간다", () => {
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground present />);
    settle();
    const [first, second] = videos();
    act(() => {
      fireEvent.ended(first!);
    });
    settle();

    rerender(<WatcherBackground present={false} />);
    settle();
    // 루프 중간에는 바꾸지 않는다.
    expect(shown()).toEqual([second]);

    act(() => {
      fireEvent.ended(second!);
    });
    settle();
    expect(first!.src).toContain("/watcher/1d51e502/exit/");
    expect(shown()).toEqual([first]);

    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(shown()).toHaveLength(0);
  });

  it("퇴장 중에 다시 비집중이면 퇴장이 끝나는 대로 다시 들어온다", () => {
    const { rerender, videos } = setup();
    rerender(<WatcherBackground present />);
    settle();
    const [first, second] = videos();
    rerender(<WatcherBackground present={false} />);
    settle();
    act(() => {
      fireEvent.ended(first!);
    });
    settle();
    expect(second!.src).toContain("/watcher/1d51e502/exit/");

    rerender(<WatcherBackground present />);
    settle();
    act(() => {
      fireEvent.ended(second!);
    });
    settle();

    expect(first!.src).toContain("/watcher/1d51e502/enter/");
  });
});

describe("WatcherBackground — 루프 B 중 퇴장", () => {
  it("가만히 서 있는 루프 B 중에 나가야 하면 끝까지 기다리지 않고 바로 퇴장한다", () => {
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground present />);
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

    rerender(<WatcherBackground present={false} />);

    expect(second!.src).toContain("/exit/");
    expect(shown()).toEqual([second]);
  });
});

describe("WatcherBackground — 이음매", () => {
  it("다음 클립이 재생되기 전까지 앞 요소의 영상을 바꾸지 않는다", () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => Promise.resolve());
    const { rerender, videos, shown } = setup();
    rerender(<WatcherBackground present />);
    const [first, second] = videos();
    act(() => {
      fireEvent.playing(first!);
    });
    settle();

    act(() => {
      fireEvent.ended(first!);
    });
    rerender(<WatcherBackground present={false} />);
    settle();

    // 다음 요소가 아직 재생을 시작하지 않아 앞 요소의 마지막 프레임이 그대로 보인다.
    expect(shown()).toEqual([first]);
    expect(first!.src).toContain("/watcher/1d51e502/enter/");

    act(() => {
      fireEvent.playing(second!);
    });
    settle();
    expect(shown()).toEqual([second]);
    expect(first!.src).toContain("/watcher/1d51e502/exit/");
  });
});

describe("WatcherDemo", () => {
  it("들어와 시계를 한 번 보고 나간 뒤, 빈 방 2초 뒤에 다시 들어온다", () => {
    const view = render(<WatcherDemo />);
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
});
