import { Button } from "@/components/ui/button";

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
 */
export function MyRoomsView({
  rooms,
  pendingCount,
  onOpenRoom,
  onOpenPending,
  onBrowsePublic,
}: {
  rooms: MyRoomSummary[];
  pendingCount: number;
  onOpenRoom: (roomId: number) => void;
  onOpenPending: () => void;
  onBrowsePublic: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 px-5 pt-3.5">
      <PendingBand count={pendingCount} onOpen={onOpenPending} />
      {rooms.length === 0 ? (
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
      ) : (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <li key={room.roomId}>
              <MyRoomCard room={room} onOpen={onOpenRoom} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
