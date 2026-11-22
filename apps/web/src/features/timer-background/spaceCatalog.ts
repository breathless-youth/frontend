import type { ShopTagResponse } from "@/features/points/gateway/pointsApiTypes";

import type { CatalogSpace } from "./spaceCatalogQuery";
import type { TimerBackgroundSelection } from "./timerBackground";

/** 공간 페이지 타일 하나. 이름은 화면 언어로 된 값이다. */
export interface SpaceItem {
  readonly selection: TimerBackgroundSelection;
  readonly name: string;
}

/** 서버 공간 섹션. 제목이 null이면 분류 없는 공간을 모은 맨 아래 묶음이고 칩이 없다. */
export interface SpaceSection {
  readonly code: string;
  readonly title: string | null;
  readonly spaces: readonly CatalogSpace[];
}

/** 감독 칩과 섹션의 코드. 서버 분류가 아니라 영상 방식으로 만든다. */
export const WATCH_CHIP = "watch";

/** 사진은 사진마다, 서버 공간은 상품마다 다른 공간이라 id까지 묶어 비교한다. */
export function spaceKey(selection: TimerBackgroundSelection): string {
  if (selection.kind === "photo") return `photo:${selection.photoId}`;
  if (selection.kind === "space") return `space:${selection.itemId}`;
  return "simple";
}

/**
 * 범위 안 공간에 붙은 분류
 *
 * 처음 나온 순서대로 한 번씩 모은다.
 * 감시 안을 다시 나누는 칩 줄이 필요해지면 감시 공간에 이 함수를 한 번 더 쓴다.
 */
// ponytail: 공간 사이 분류 순서는 처음 나온 순서가 이긴다. 서버가 분류 순서 값을 주면 그 값으로 정렬한다.
export function collectTags(spaces: readonly CatalogSpace[]): ShopTagResponse[] {
  const seen = new Map<string, ShopTagResponse>();
  for (const space of spaces) {
    for (const tag of space.tags) if (!seen.has(tag.code)) seen.set(tag.code, tag);
  }
  return [...seen.values()];
}

function tagSections(spaces: readonly CatalogSpace[]): SpaceSection[] {
  return [
    ...collectTags(spaces).map((tag) => ({
      code: tag.code,
      title: tag.name,
      spaces: spaces.filter((space) => space.tags.some((each) => each.code === tag.code)),
    })),
    { code: "", title: null, spaces: spaces.filter((space) => space.tags.length === 0) },
  ].filter((section) => section.spaces.length > 0);
}

/**
 * 영상 탭 섹션
 *
 * 감시 공간을 모은 감독 섹션이 먼저이고 반복 영상의 분류 섹션이 서버 순서로 뒤에 온다.
 * 감시 공간은 분류가 붙어도 감독 섹션에만 둔다.
 */
export function videoSections(spaces: readonly CatalogSpace[], watchTitle: string): SpaceSection[] {
  const videos = spaces.filter((space) => space.selection.assetType === "VIDEO");
  return [
    {
      code: WATCH_CHIP,
      title: watchTitle,
      spaces: videos.filter((space) => space.selection.videoMode === "WATCH"),
    },
    ...tagSections(videos.filter((space) => space.selection.videoMode !== "WATCH")),
  ].filter((section) => section.spaces.length > 0);
}

/** 이미지 탭의 서버 공간 섹션. 내 사진과 심플은 페이지가 따로 그린다. */
export function imageSections(spaces: readonly CatalogSpace[]): SpaceSection[] {
  return tagSections(spaces.filter((space) => space.selection.assetType === "IMAGE"));
}
