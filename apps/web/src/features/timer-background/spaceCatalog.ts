import type { SpaceCategory, SpaceTab } from "@/lib/amplitude";

import type { TimerBackgroundSelection } from "./timerBackground";

export type { SpaceCategory };

/** 공간 페이지 타일 하나. 이름은 화면 언어로 번역된 값이다. */
export interface SpaceItem {
  readonly selection: TimerBackgroundSelection;
  readonly name: string;
  readonly tab: SpaceTab;
  readonly category: SpaceCategory;
}

/** 사진은 사진마다 다른 공간이라 id까지 묶어 비교한다. */
export function spaceKey(selection: TimerBackgroundSelection): string {
  return selection.kind === "photo" ? `photo:${selection.photoId}` : selection.kind;
}

/** 검색은 화면에 보이는 이름에만 건다. */
export function filterSpaces(
  items: readonly SpaceItem[],
  query: { tab: SpaceTab; category: SpaceCategory | "all"; text: string },
): SpaceItem[] {
  const text = query.text.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.tab === query.tab &&
      (query.category === "all" || item.category === query.category) &&
      item.name.toLocaleLowerCase().includes(text),
  );
}
