import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

import { CategoryChips, ONE_CHIP_ROW_HEIGHT } from "../components/CategoryChips";
import { PublicRoomCard } from "../components/PublicRoomCard";
import { RoomsEmptyState } from "../components/RoomsEmptyState";
import { TranslationNotice } from "../components/TranslationNotice";
import { hasGroupTranslation } from "../model/groupTranslation";
import type { CategoryOption, PublicRoomSummary } from "../types";
import { useInfiniteSentinel } from "../useInfiniteSentinel";

const EMPTY_COPY_KEY = {
  none: {
    title: "publicRoomsView.noneTitle",
    description: "publicRoomsView.noneDescription",
  },
  filtered: {
    title: "publicRoomsView.filteredTitle",
    description: "publicRoomsView.filteredDescription",
  },
} as const;

/**
 * 공개 그룹 탭 본문
 *
 * 거르기와 정렬은 서버가 맡아서 받은 목록을 순서 그대로 그린다.
 * 서버가 걸러 준 목록만으로는 전체가 비었는지 알 수 없어, 검색어와 칩이 모두 비어 있을 때만 공개 그룹이 하나도 없다고 쓴다.
 * 빈 상태에는 버튼을 두지 않고 그룹 만들기는 `+` 버튼이 맡는다.
 * 목록을 받는 동안에도 검색어와 칩을 바꿀 수 있게 하고, 받아 둔 목록이 있으면 다시 받는 중이거나 실패해도 그 목록을 보인다.
 * 목록이 없을 때만 목록 자리에 오류나 자리표시를 두어 빈 상태가 잠깐 보이지 않게 한다.
 * 서버에 다음 쪽이 있으면 목록 끝에 보이지 않는 감지 칸을 두어 그 칸이 화면에 들어올 때 다음 쪽을 부른다.
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
  hasMore = false,
  onLoadMore,
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
  /** 서버에 다음 쪽이 있는지 */
  hasMore?: boolean;
  /** 목록 끝이 보일 때 다음 쪽을 받고, 받는 중에 또 불려도 한 번만 받는 일은 호출부가 맡는다. */
  onLoadMore?: () => void;
  onOpenRoom: (roomId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const [expanded, setExpanded] = useState(false);
  // 펼친 채로 고른 칩은 접을 때 앞으로 꺼내고, 접힌 채로 고를 때는 누르는 자리가 움직이지 않게 그대로 둔다.
  const [leading, setLeading] = useState(category);
  const [hasOverflow, setHasOverflow] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const measure = () => setHasOverflow(element.scrollHeight > ONE_CHIP_ROW_HEIGHT);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [categories, t]);
  const watchMore = hasMore && onLoadMore !== undefined;
  const moreRef = useInfiniteSentinel(() => onLoadMore?.(), watchMore);
  const emptyCopy =
    query.trim() === "" && category === null ? EMPTY_COPY_KEY.none : EMPTY_COPY_KEY.filtered;
  let list: ReactNode;
  if (rooms.length > 0) {
    list = (
      <>
        <ul className="flex flex-col gap-2.5 pt-2.5">
          {rooms.map((room) => (
            <li key={room.roomId}>
              <PublicRoomCard room={room} onOpen={onOpenRoom} />
            </li>
          ))}
        </ul>
        {watchMore && (
          <div ref={moreRef} aria-hidden="true" data-testid="public-rooms-more" className="h-px" />
        )}
      </>
    );
  } else if (error) {
    list = <div className="pt-2.5">{error}</div>;
  } else if (loading) {
    list = (
      <div className="flex flex-col gap-2.5 pt-2.5">
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="h-26 rounded-xl" />
      </div>
    );
  } else {
    list = (
      <RoomsEmptyState
        title={t(emptyCopy.title)}
        description={t(emptyCopy.description)}
        className="pt-12"
      />
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
          aria-label={t("publicRoomsView.search")}
          placeholder={t("publicRoomsView.search")}
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="relative pt-3">
        <div
          ref={measureRef}
          aria-hidden="true"
          inert
          className="pointer-events-none invisible absolute inset-x-0 top-3"
        >
          <CategoryChips
            options={categories}
            value={category}
            onChange={onCategoryChange}
            allLabel={t("publicRoomsView.allCategories")}
          />
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <CategoryChips
              options={categories}
              value={category}
              onChange={onCategoryChange}
              allLabel={t("publicRoomsView.allCategories")}
              compact={hasOverflow && !expanded}
              leading={leading}
            />
          </div>
          {hasOverflow && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                if (expanded) setLeading(category);
                setExpanded(!expanded);
              }}
              className="flex h-9 shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground"
            >
              {t(
                expanded
                  ? "publicRoomsView.collapseCategories"
                  : "publicRoomsView.expandCategories",
              )}
              <ChevronDown
                aria-hidden="true"
                className={cn("size-4 shrink-0", expanded && "rotate-180")}
              />
            </button>
          )}
        </div>
      </div>
      {/* 번역된 카드가 하나라도 있는지로 정해서 원문 보기 중에도 다시 번역으로 돌아갈 버튼이 남는다. */}
      {rooms.some((room) => hasGroupTranslation(room.translatedName)) && (
        <TranslationNotice variant="list" className="pt-3 pb-0.5" />
      )}
      {list}
    </div>
  );
}
