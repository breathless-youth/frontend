import { describe, expect, it, vi } from "vitest";

import { kickVideoPlayback } from "../videoPlayback";

function pausedVideo() {
  const video = document.createElement("video");
  Object.defineProperty(video, "paused", { value: true });
  video.play = vi.fn().mockResolvedValue(undefined);
  return video;
}

describe("kickVideoPlayback", () => {
  it("탭 재생 표시가 있는 멈춘 영상은 다시 재생한다", () => {
    const video = pausedVideo();
    video.setAttribute("data-play-on-tap", "");
    kickVideoPlayback(video);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("표시도 스트림도 없는 멈춘 영상은 재생하지 않는다", () => {
    const video = pausedVideo();
    kickVideoPlayback(video);
    expect(video.play).not.toHaveBeenCalled();
  });
});
