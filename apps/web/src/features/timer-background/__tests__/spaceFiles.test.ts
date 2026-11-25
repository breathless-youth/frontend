import { describe, expect, it } from "vitest";

import {
  distractImageUrl,
  distractPosterUrl,
  distractSoundUrl,
  distractVideoUrl,
  imageUrl,
  loopPosterUrl,
  loopVideoUrl,
  spaceScreen,
  spaceTileUrl,
  watchClipUrl,
  watchPosterUrl,
  watchScreen,
  watchSoundUrl,
} from "../spaceFiles";

const KEY = "loop/1a2b3c4d";
const view = (width: number, height: number) => ({ width, height });

describe("spaceFiles", () => {
  it("짧은 변 600 미만은 휴대폰, 이상은 태블릿이고 가로가 길면 가로다", () => {
    expect(watchScreen(view(390, 844))).toBe("phone_portrait");
    expect(watchScreen(view(844, 390))).toBe("phone_landscape");
    expect(watchScreen(view(820, 1180))).toBe("tablet_portrait");
    expect(watchScreen(view(1180, 820))).toBe("tablet_landscape");
  });

  it("반복 영상과 포스터는 화면 이름으로 주소를 만든다", () => {
    const screen = spaceScreen(view(390, 844));

    expect(loopVideoUrl(KEY, screen)).toBe("/spaces/loop/1a2b3c4d/loop/phone_portrait.mp4");
    expect(loopPosterUrl(KEY, screen)).toBe("/spaces/loop/1a2b3c4d/poster/phone_portrait.webp");
  });

  it("그림은 image 폴더의 webp다", () => {
    expect(imageUrl("image/desk", "tablet_landscape")).toBe(
      "/spaces/image/desk/image/tablet_landscape.webp",
    );
  });

  it("가로 1200 이상이고 가로가 긴 화면만 PC 파일을 쓴다", () => {
    expect(spaceScreen(view(1440, 900))).toBe("desktop");
    expect(spaceScreen(view(1199, 800))).toBe("tablet_landscape");
    expect(spaceScreen(view(1200, 1600))).toBe("tablet_portrait");
  });

  it("감독은 장면·포스터·소리 주소를 만들고 PC 크기에서도 태블릿 가로를 쓴다", () => {
    const key = "watcher/9c8d9f19";
    const screen = watchScreen(view(1440, 900));

    expect(watchClipUrl(key, "loop-a", screen)).toBe(
      "/spaces/watcher/9c8d9f19/loop-a/tablet_landscape.mp4",
    );
    expect(watchPosterUrl(key, screen)).toBe(
      "/spaces/watcher/9c8d9f19/poster/tablet_landscape.jpg",
    );
    expect(watchSoundUrl(key, "approach")).toBe("/spaces/watcher/9c8d9f19/sound/approach.m4a");
  });

  it("타일 그림은 감독이면 폰 세로 포스터, 아니면 thumb.webp다", () => {
    expect(spaceTileUrl({ assetKey: "watcher/9c8d9f19", videoMode: "WATCH" })).toBe(
      "/spaces/watcher/9c8d9f19/poster/phone_portrait.jpg",
    );
    expect(spaceTileUrl({ assetKey: KEY, videoMode: "LOOP" })).toBe(
      "/spaces/loop/1a2b3c4d/thumb.webp",
    );
    expect(spaceTileUrl({ assetKey: "image/desk", videoMode: null })).toBe(
      "/spaces/image/desk/thumb.webp",
    );
  });
  it("비집중 장면은 distract 폴더 아래에 집중 장면과 같은 화면 이름으로 있다", () => {
    expect(distractVideoUrl(KEY, "desktop")).toBe(
      "/spaces/loop/1a2b3c4d/distract/loop/desktop.mp4",
    );
    expect(distractPosterUrl(KEY, "phone_portrait")).toBe(
      "/spaces/loop/1a2b3c4d/distract/poster/phone_portrait.webp",
    );
    expect(distractImageUrl(KEY, "tablet_landscape")).toBe(
      "/spaces/loop/1a2b3c4d/distract/image/tablet_landscape.webp",
    );
    expect(distractSoundUrl(KEY, "loop")).toBe("/spaces/loop/1a2b3c4d/distract/sound/loop.m4a");
    expect(distractSoundUrl(KEY, "cue")).toBe("/spaces/loop/1a2b3c4d/distract/sound/cue.m4a");
    expect(distractSoundUrl(KEY, "approach")).toBe(
      "/spaces/loop/1a2b3c4d/distract/sound/approach.m4a",
    );
  });
});
