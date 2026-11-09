import { ChevronRight, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { studyingCount, studyingCountText } from "../model/desks";
import { memberCountText } from "../model/limits";
import { pickGroupText, useShowOriginal } from "../model/groupTranslation";
import type { MyRoomSummary } from "../types";
import { VISIBILITY_TONE_CLASS, visibilityText } from "../visibility";
import { DeskRow } from "./DeskRow";
import { CategoryTag } from "./RoomMeta";
import { StudyStatus } from "./StudyStatus";

/**
 * 내 그룹 카드
 *
 * 카드 본문이 그룹 홈으로 가는 버튼이다.
 * 새 신청이 있으면 그 아래에 신청 확인으로 바로 가는 버튼을 하나 더 둔다.
 * 책상 줄은 화면 낭독기에서 빠지므로 카드 이름에 공개 표시, 시험·목표, 멤버 수, 공부 상태를 모두 담는다.
 */
export function MyRoomCard({
  room,
  onOpen,
  onOpenRequests,
}: {
  room: MyRoomSummary;
  onOpen: (roomId: number) => void;
  onOpenRequests: (roomId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const name = pickGroupText(room.name, room.translatedName, useShowOriginal());
  const count = studyingCount(room.members);
  const label = [
    name,
    visibilityText(room.visibility),
    room.categoryLabel,
    memberCountText(room.memberCount),
    studyingCountText(count),
  ].join(", ");
  const requestsText = t("myRoomCard.newRequests", { count: room.newRequestCount });
  return (
    <div className="overflow-hidden rounded-xl bg-muted shadow-sb-card">
      <button
        type="button"
        aria-label={label}
        // Amplitude 클릭 자동 수집이 싣는 그룹 이름, 닉네임 글자와 aria-label을 가린다.
        data-amp-mask
        data-amp-mask-attributes="aria-label"
        // Sentry 클릭 기록은 aria-label 대신 이 이름을 적는다.
        data-sentry-element="MyRoomCard"
        onClick={() => onOpen(room.roomId)}
        className="flex w-full flex-col gap-2.5 p-4 text-left focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="flex w-full items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-base leading-5.5 font-bold text-foreground">{name}</span>
            <span className="flex items-center gap-1">
              <CategoryTag label={room.categoryLabel} />
              <span className="pl-1 text-xs leading-4 text-muted-foreground">
                {memberCountText(room.memberCount)}
              </span>
            </span>
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-0.75 rounded-full px-2.25 py-0.75 text-xs leading-4 font-bold",
              VISIBILITY_TONE_CLASS[room.visibility],
            )}
          >
            {room.visibility === "private" && (
              <Lock aria-hidden="true" size={12} strokeWidth={2.4} />
            )}
            {visibilityText(room.visibility)}
          </span>
        </span>
        <StudyStatus count={count} />
        <DeskRow members={room.members} />
      </button>
      {room.newRequestCount > 0 && (
        <button
          type="button"
          aria-label={`${name}, ${requestsText}`}
          data-amp-mask
          data-amp-mask-attributes="aria-label"
          data-sentry-element="MyRoomCardRequests"
          onClick={() => onOpenRequests(room.roomId)}
          className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-border px-4 text-left text-[13px] leading-5 font-bold text-brand-subtle-text focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none focus-visible:ring-inset"
        >
          {requestsText}
          <ChevronRight aria-hidden="true" size={16} strokeWidth={2.4} className="shrink-0" />
        </button>
      )}
    </div>
  );
}
