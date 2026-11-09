import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";

import { MyRoomCard } from "../components/MyRoomCard";
import { PendingBand } from "../components/PendingBand";
import { RoomsEmptyState } from "../components/RoomsEmptyState";
import { TranslationNotice } from "../components/TranslationNotice";
import { hasGroupTranslation } from "../model/groupTranslation";
import type { MyRoomSummary } from "../types";

/**
 * 내 그룹 탭 본문
 *
 * 답을 기다리는 신청은 들어간 그룹이 없어도 보여야 해서 띠를 빈 상태보다 위에 둔다.
 * 카드는 받은 순서, 곧 그룹에 들어간 순서대로 놓는다.
 * 그룹 만들기와 초대코드 참여는 `+` 버튼이 맡아서 빈 상태에는 공개 그룹으로 가는 버튼만 둔다.
 * 받아 둔 그룹이 있으면 다시 받는 중이거나 실패해도 그룹을 보인다.
 * 그룹이 없을 때만 목록 자리에 오류나 자리표시를 두어 빈 상태가 잠깐 보이지 않게 한다.
 */
export function MyRoomsView({
  rooms,
  pendingCount,
  loading = false,
  error,
  onOpenRoom,
  onOpenRequests,
  onOpenPending,
  onBrowsePublic,
}: {
  rooms: MyRoomSummary[];
  pendingCount: number;
  loading?: boolean;
  /** 목록을 받지 못했을 때 목록 자리에 둘 오류 표시이고, 다시 시도까지 호출부가 채운다. */
  error?: ReactNode;
  onOpenRoom: (roomId: number) => void;
  onOpenRequests: (roomId: number) => void;
  onOpenPending: () => void;
  onBrowsePublic: () => void;
}) {
  const { t } = useTranslation("group-room");
  let body: ReactNode;
  if (rooms.length > 0) {
    body = (
      <>
        {rooms.some((room) => hasGroupTranslation(room.translatedName)) && (
          <TranslationNotice variant="list" className="-mb-1" />
        )}
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <li key={room.roomId}>
              <MyRoomCard room={room} onOpen={onOpenRoom} onOpenRequests={onOpenRequests} />
            </li>
          ))}
        </ul>
      </>
    );
  } else if (error) {
    body = error;
  } else if (loading) {
    body = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-41 rounded-xl" />
        <Skeleton className="h-41 rounded-xl" />
      </div>
    );
  } else {
    body = (
      <RoomsEmptyState
        title={t("myRoomsView.emptyTitle")}
        description={t("myRoomsView.emptyDescription")}
        className="pt-14.5"
      >
        <Button
          size="xl"
          onClick={onBrowsePublic}
          className="mt-6 w-full rounded-xl text-[17px] leading-5.25 font-bold shadow-sb-cta"
        >
          {t("myRoomsView.browsePublic")}
        </Button>
      </RoomsEmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-5 pt-3.5">
      <PendingBand count={pendingCount} onOpen={onOpenPending} />
      {body}
    </div>
  );
}
