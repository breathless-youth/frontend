import type { WatcherClip } from "./watcher/watcherClips";

/** 태블릿 파일을 쓰는 짧은 변 기준. 휴대폰은 가로로 돌려도 짧은 변이 500을 넘지 않는다. */
export const TABLET_SHORT_SIDE_PX = 600;

/** PC 파일을 쓰는 창 가로 기준. 가로가 긴 창에서만 쓴다. */
const DESKTOP_MIN_WIDTH_PX = 1200;

export type Viewport = { width: number; height: number };

/** 감시 파일의 화면 이름. 감시는 PC 파일이 없다. */
export type WatchScreen = `${"phone" | "tablet"}_${"portrait" | "landscape"}`;

/** 휴대폰·태블릿 구분. 돌려도 바뀌지 않는다. */
export function spaceDevice(viewport: Viewport): "phone" | "tablet" {
  return Math.min(viewport.width, viewport.height) >= TABLET_SHORT_SIDE_PX ? "tablet" : "phone";
}

/** 감시 파일의 화면 이름. PC 크기 창은 가로가 길고 짧은 변이 태블릿 기준을 넘어 태블릿 가로가 된다. */
export function watchScreen(viewport: Viewport): WatchScreen {
  return `${spaceDevice(viewport)}_${viewport.width > viewport.height ? "landscape" : "portrait"}`;
}

/** 반복 영상과 그림 파일의 화면 이름 */
export type SpaceScreen = WatchScreen | "desktop";

/** 반복 영상과 그림 파일의 화면 이름 */
export function spaceScreen(viewport: Viewport): SpaceScreen {
  return viewport.width >= DESKTOP_MIN_WIDTH_PX && viewport.width > viewport.height
    ? "desktop"
    : watchScreen(viewport);
}

/** 공간 하나의 파일 폴더. 폴더 이름에 내용 해시가 있어 파일을 바꾸면 주소도 바뀐다. */
export function spaceFolder(assetKey: string): string {
  return `/spaces/${assetKey}/`;
}

export function loopVideoUrl(assetKey: string, screen: SpaceScreen): string {
  return `${spaceFolder(assetKey)}loop/${screen}.mp4`;
}

export function loopPosterUrl(assetKey: string, screen: SpaceScreen): string {
  return `${spaceFolder(assetKey)}poster/${screen}.webp`;
}

export function imageUrl(assetKey: string, screen: SpaceScreen): string {
  return `${spaceFolder(assetKey)}image/${screen}.webp`;
}

export function watchClipUrl(assetKey: string, clip: WatcherClip, screen: WatchScreen): string {
  return `${spaceFolder(assetKey)}${clip}/${screen}.mp4`;
}

export function watchPosterUrl(assetKey: string, screen: WatchScreen): string {
  return `${spaceFolder(assetKey)}poster/${screen}.jpg`;
}

export function watchSoundUrl(assetKey: string, cue: "approach" | "enter" | "exit"): string {
  return `${spaceFolder(assetKey)}sound/${cue}.m4a`;
}

/**
 * 공간 카드 그림
 *
 * 감시 공간은 따로 만든 썸네일이 없어 캐릭터가 들어오기 전 빈 방인 폰 세로 포스터를 쓴다.
 * 카드는 4:3이라 세로 포스터를 가운데 잘라 보인다.
 */
export function spaceTileUrl(space: { assetKey: string; videoMode: string | null }): string {
  return space.videoMode === "WATCH"
    ? watchPosterUrl(space.assetKey, "phone_portrait")
    : `${spaceFolder(space.assetKey)}thumb.webp`;
}
