import { act, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DistractSpace, ImageSpace, LoopVideoSpace } from "../SpaceLayers";

const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ reportHandled }));

const KEY = "loop/1a2b3c4d";

function windowSize(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

function rotate(width: number, height: number) {
  windowSize(width, height);
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  reportHandled.mockReset();
  windowSize(390, 844);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LoopVideoSpace", () => {
  it("화면에 맞는 영상을 소리 없이 반복하고 포스터를 걸며 화면 읽기에서 숨는다", () => {
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);
    const video = container.querySelector("video")!;

    expect(video.src).toContain("/spaces/loop/1a2b3c4d/loop/phone_portrait.mp4");
    expect(video.poster).toContain("/spaces/loop/1a2b3c4d/poster/phone_portrait.webp");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute("aria-hidden", "true");
  });

  it("영상을 받지 못하면 포스터를 그리고 Sentry에 남긴다", () => {
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);

    fireEvent.error(container.querySelector("video")!);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")!.src).toContain("/poster/phone_portrait.webp");
    expect(reportHandled).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "space-file");
  });

  it("포스터도 받지 못하면 부른 쪽에 알린다", () => {
    const onUnavailable = vi.fn();
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={onUnavailable} />);

    fireEvent.error(container.querySelector("video")!);
    fireEvent.error(container.querySelector("img")!);

    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(reportHandled).toHaveBeenCalledTimes(2);
  });

  it("동작 줄이기면 처음부터 포스터만 보인다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")!.src).toContain("/poster/phone_portrait.webp");
  });

  it("화면이 숨으면 멈추고 다시 보이면 이어서 재생한다", () => {
    render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);
    const hidden = vi.spyOn(document, "hidden", "get");

    hidden.mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();

    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("세로에서 가로로 돌리면 가로용 영상으로 바꾸고 재생 위치를 이어 간다", () => {
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 5 });
    Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
    fireEvent.timeUpdate(video);

    act(() => rotate(844, 390));

    const next = container.querySelector("video")!;
    expect(next.src).toContain("/loop/phone_landscape.mp4");
    expect(next.poster).toContain("/poster/phone_landscape.webp");
    // 새 파일을 받는 동안 0으로 돌아가며 오는 timeupdate는 기억한 위치를 덮지 않는다.
    Object.defineProperty(next, "currentTime", { configurable: true, writable: true, value: 0 });
    fireEvent.timeUpdate(next);
    Object.defineProperty(next, "duration", { configurable: true, value: 16 });
    Object.defineProperty(next, "readyState", { configurable: true, value: 1 });
    fireEvent.loadedMetadata(next);
    expect(next.currentTime).toBe(5);
  });

  it("돌린 뒤 화면이 숨으면 새 영상을 멈추고, 앞 영상은 정리할 때 멈춘다", () => {
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);
    const first = container.querySelector("video")!;
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);

    act(() => rotate(844, 390));
    const next = container.querySelector("video")!;
    expect(pause.mock.contexts).toContain(first);

    pause.mockClear();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));

    expect(pause.mock.contexts).toEqual([next]);
  });

  it("StrictMode로 효과가 한 번 더 돌아도 영상은 재생 상태로 남는다", () => {
    render(
      <StrictMode>
        <LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />
      </StrictMode>,
    );
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);

    const lastPlay = Math.max(0, ...play.mock.invocationCallOrder);
    const lastPause = Math.max(0, ...pause.mock.invocationCallOrder);
    expect(lastPlay).toBeGreaterThan(lastPause);
  });

  it("맞는 파일이 같으면 크기가 조금 바뀌어도 영상을 다시 받지 않는다", () => {
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);
    const video = container.querySelector("video")!;
    const before = video.src;

    act(() => rotate(393, 852));

    expect(container.querySelector("video")).toBe(video);
    expect(video.src).toBe(before);
  });

  it("PC 크기 화면은 desktop 파일을 쓴다", () => {
    windowSize(1440, 900);
    const { container } = render(<LoopVideoSpace assetKey={KEY} onUnavailable={vi.fn()} />);

    expect(container.querySelector("video")!.src).toContain("/loop/desktop.mp4");
  });
});

describe("ImageSpace", () => {
  it("화면에 맞는 그림을 그린다", () => {
    windowSize(844, 390);
    const { container } = render(<ImageSpace assetKey="image/desk" onUnavailable={vi.fn()} />);
    const img = container.querySelector("img")!;

    expect(img.src).toContain("/spaces/image/desk/image/phone_landscape.webp");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("세로에서 가로로 돌리면 가로용 그림으로 바꾼다", () => {
    const { container } = render(<ImageSpace assetKey="image/desk" onUnavailable={vi.fn()} />);

    act(() => rotate(844, 390));

    expect(container.querySelector("img")!.src).toContain("/image/phone_landscape.webp");
  });

  it("그림을 받지 못하면 Sentry에 남기고 부른 쪽에 알린다", () => {
    const onUnavailable = vi.fn();
    const { container } = render(
      <ImageSpace assetKey="image/desk" onUnavailable={onUnavailable} />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(reportHandled).toHaveBeenCalledOnce();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });
});

describe("DistractSpace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("영상이면 화면에 맞는 비집중 영상을 멈춘 채 받아 두고 비집중 포스터를 먼저 건다", () => {
    const { container } = render(<DistractSpace assetKey={KEY} visual="video" present={false} />);
    const video = container.querySelector("video")!;

    expect(video.src).toContain("/spaces/loop/1a2b3c4d/distract/loop/phone_portrait.mp4");
    expect(video.poster).toContain("/spaces/loop/1a2b3c4d/distract/poster/phone_portrait.webp");
    expect(video).toHaveAttribute("preload", "auto");
    expect(video).toHaveAttribute("aria-hidden", "true");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveClass("opacity-0");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("보이게 되면 재생하며 0.6초 동안 드러내고, 돌아오면 감춘 뒤에 멈춘다", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <DistractSpace assetKey={KEY} visual="video" present={false} />,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();

    rerender(<DistractSpace assetKey={KEY} visual="video" present />);
    const video = container.querySelector("video")!;
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(video).toHaveClass("opacity-100", "transition-opacity", "duration-600");

    rerender(<DistractSpace assetKey={KEY} visual="video" present={false} />);
    expect(video).toHaveClass("opacity-0");
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(pause).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pause).toHaveBeenCalledOnce();
  });

  it("그림이면 비집중 그림을 같은 방식으로 겹친다", () => {
    const { container, rerender } = render(
      <DistractSpace assetKey={KEY} visual="image" present={false} />,
    );
    const img = container.querySelector("img")!;

    expect(img.src).toContain("/spaces/loop/1a2b3c4d/distract/image/phone_portrait.webp");
    expect(img).toHaveClass("opacity-0");

    rerender(<DistractSpace assetKey={KEY} visual="image" present />);
    expect(img).toHaveClass("opacity-100");
  });

  it("동작 줄이기면 비집중 포스터를 쓰고 겹치는 전환 없이 바로 바꾼다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const { container } = render(<DistractSpace assetKey={KEY} visual="video" present />);
    const img = container.querySelector("img")!;

    expect(container.querySelector("video")).toBeNull();
    expect(img.src).toContain("/distract/poster/phone_portrait.webp");
    expect(img).toHaveClass("opacity-100");
    expect(img).not.toHaveClass("transition-opacity");
  });

  it("보이는 동안 화면이 숨으면 멈추고 다시 보이면 잇는다", () => {
    render(<DistractSpace assetKey={KEY} visual="video" present />);
    const hidden = vi.spyOn(document, "hidden", "get");

    hidden.mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();

    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it("돌리면 그 화면의 비집중 영상으로 바꾼다", () => {
    const { container } = render(<DistractSpace assetKey={KEY} visual="video" present />);

    act(() => rotate(844, 390));

    expect(container.querySelector("video")!.src).toContain("/distract/loop/phone_landscape.mp4");
  });

  it("받지 못하면 Sentry에 남기고 그리지 않아 집중 장면이 그대로 보인다", () => {
    const { container } = render(<DistractSpace assetKey={KEY} visual="video" present />);

    fireEvent.error(container.querySelector("video")!);

    expect(container).toBeEmptyDOMElement();
    expect(reportHandled).toHaveBeenCalledExactlyOnceWith(expect.any(Error), "space-file");
  });
});
