import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/Skeleton";

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
 * 목록을 받는 동안에도 검색어와 칩을 바꿀 수 있게 두고, 빈 상태가 잠깐 보이지 않도록 목록 자리에만 자리표시나 오류를 둔다.
 */
export function PublicRoomsView({
  query,
  onQueryChange,
  categories,
  category,
  onCategoryChange,
  rooms,
  loading = false,
  error,
  onOpenRoom,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  categories: CategoryOption[];
  category: string | null;
  onCategoryChange: (value: string | null) => void;
  rooms: PublicRoomSummary[];
  loading?: boolean;
  /** 목록을 받지 못했을 때 목록 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  error?: ReactNode;
  onOpenRoom: (roomId: number) => void;
}) {
  const emptyCopy =
    query.trim() === "" && category === null ? EMPTY_COPY.none : EMPTY_COPY.filtered;
  let list: ReactNode;
  if (error) {
    list = <div className="pt-2.5">{error}</div>;
  } else if (loading) {
    list = (
      <div className="flex flex-col gap-2.5 pt-2.5">
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="h-26 rounded-xl" />
      </div>
    );
  } else if (rooms.length === 0) {
    list = (
      <RoomsEmptyState
        title={emptyCopy.title}
        description={emptyCopy.description}
        className="pt-12"
      />
    );
  } else {
    list = (
      <ul className="flex flex-col gap-2.5 pt-2.5">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <PublicRoomCard room={room} onOpen={onOpenRoom} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col px-5 pt-4">
      <label className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted px-4 focus-within:ring-2 focus-within:ring-(--state-focus)">
        <Search aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          // 검색어는 쓰는 대로 넘어가 목록이 바로 걸러지므로 키보드의 검색 키는 키보드만 내린다.
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
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
      {list}
    </div>
  );
}
