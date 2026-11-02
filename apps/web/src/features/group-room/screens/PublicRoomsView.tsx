import { Search } from "lucide-react";

import { CategoryChips } from "../components/CategoryChips";
import { PublicRoomCard } from "../components/PublicRoomCard";
import { RoomsEmptyState } from "../components/RoomsEmptyState";
import type { CategoryOption, PublicRoomSummary } from "../types";

const EMPTY_COPY = {
  none: {
    title: "아직 공개 그룹이 없어요",
    description: "첫 공개 그룹을 만들어 같이 공부할 사람을 모아 보세요",
  },
  filtered: {
    title: "조건에 맞는 공개 그룹이 없어요",
    description: "다른 조건을 고르거나 직접 그룹을 만들어 보세요",
  },
} as const;

/**
 * 공개 그룹 탭 본문
 *
 * 거르기와 정렬은 서버가 맡아서 받은 목록을 순서 그대로 그린다.
 * 서버가 걸러 준 목록만으로는 전체가 비었는지 알 수 없어, 검색어와 칩이 모두 비어 있을 때만 공개 그룹이 하나도 없다고 쓴다.
 * 빈 상태에는 버튼을 두지 않고 그룹 만들기는 `+` 버튼이 맡는다.
 */
export function PublicRoomsView({
  query,
  onQueryChange,
  categories,
  category,
  onCategoryChange,
  rooms,
  onOpenRoom,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  categories: CategoryOption[];
  category: string | null;
  onCategoryChange: (value: string | null) => void;
  rooms: PublicRoomSummary[];
  onOpenRoom: (roomId: number) => void;
}) {
  const emptyCopy =
    query.trim() === "" && category === null ? EMPTY_COPY.none : EMPTY_COPY.filtered;
  return (
    <div className="flex flex-col px-5 pt-4">
      <label className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted px-4 focus-within:border-primary">
        <Search aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="그룹 이름으로 찾기"
          placeholder="그룹 이름으로 찾기"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="pt-3">
        <CategoryChips
          options={categories}
          value={category}
          onChange={onCategoryChange}
          allLabel="전체"
        />
      </div>
      {rooms.length === 0 ? (
        <RoomsEmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          className="pt-12"
        />
      ) : (
        <ul className="flex flex-col gap-2.5 pt-2.5">
          {rooms.map((room) => (
            <li key={room.roomId}>
              <PublicRoomCard room={room} onOpen={onOpenRoom} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
