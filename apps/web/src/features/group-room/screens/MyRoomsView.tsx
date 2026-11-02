import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";

import { MyRoomCard } from "../components/MyRoomCard";
import { PendingBand } from "../components/PendingBand";
import { RoomsEmptyState } from "../components/RoomsEmptyState";
import type { MyRoomSummary } from "../types";

/**
 * 내 그룹 탭 본문
 *
 * 답을 기다리는 신청은 들어간 그룹이 없어도 보여야 해서 띠를 빈 상태보다 위에 둔다.
 * 카드는 받은 순서, 곧 그룹에 들어간 순서대로 놓는다.
 * 그룹 만들기와 초대코드 참여는 `+` 버튼이 맡아서 빈 상태에는 공개 그룹으로 가는 버튼만 둔다.
 * 목록을 받기 전이나 받지 못했을 때 빈 상태가 잠깐 보이지 않도록 목록 자리에 자리표시나 오류를 먼저 둔다.
 */
export function MyRoomsView({
  rooms,
  pendingCount,
  loading = false,
  error,
  onOpenRoom,
  onOpenPending,
  onBrowsePublic,
}: {
  rooms: MyRoomSummary[];
  pendingCount: number;
  loading?: boolean;
  /** 목록을 받지 못했을 때 목록 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  error?: ReactNode;
  onOpenRoom: (roomId: number) => void;
  onOpenPending: () => void;
  onBrowsePublic: () => void;
}) {
  let body: ReactNode;
  if (error) {
    body = error;
  } else if (loading) {
    body = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-41 rounded-xl" />
        <Skeleton className="h-41 rounded-xl" />
      </div>
    );
  } else if (rooms.length === 0) {
    body = (
      <RoomsEmptyState
        title="아직 들어간 그룹이 없어요"
        description="공개 그룹에 신청하거나 그룹을 만들어 보세요"
        className="pt-14.5"
      >
        <Button
          size="xl"
          onClick={onBrowsePublic}
          className="mt-6 w-full rounded-xl text-[17px] leading-5.25 font-bold shadow-sb-cta"
        >
          공개 그룹 둘러보기
        </Button>
      </RoomsEmptyState>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-3">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <MyRoomCard room={room} onOpen={onOpenRoom} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-5 pt-3.5">
      <PendingBand count={pendingCount} onOpen={onOpenPending} />
      {body}
    </div>
  );
}
