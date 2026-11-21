import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageSpace, LoopVideoSpace } from "../SpaceLayers";

const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ reportHandled }));

const KEY = "loop/1a2b3c4d";

function windowSize(width: number, height: number) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
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
