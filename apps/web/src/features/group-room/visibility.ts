import i18n from "@/lib/i18n";

import type { RoomVisibility } from "./model/roomMenu";

const VISIBILITY_TEXT_KEY = {
  public: "group-room:visibility.public",
  private: "group-room:visibility.private",
} as const satisfies Record<RoomVisibility, string>;

/**
 * 공개 표시 글자
 *
 * 보이는 표시와 카드를 읽어 주는 이름이 같은 말을 쓰도록 한곳에 둔다.
 */
export function visibilityText(visibility: RoomVisibility): string {
  return i18n.t(VISIBILITY_TEXT_KEY[visibility]);
}

/**
 * 공개 표시의 바탕과 글자 색
 *
 * 카드 제목 줄의 표시와 그룹 이름 아래 정보 줄의 표시는 크기만 다르므로 색은 글자와 함께 한곳에 둔다.
 */
export const VISIBILITY_TONE_CLASS: Record<RoomVisibility, string> = {
  public: "bg-brand-subtle text-brand-subtle-text",
  private: "bg-bg-layer-2 text-muted-foreground",
};
