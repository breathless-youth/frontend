import { Check } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { joinPolicyText } from "../model/joinPolicy";
import { JoinPolicyChip } from "./JoinPolicyChip";
import { studyingCountText } from "../model/desks";
import { memberCountText } from "../model/limits";
import { formatHoursMinutes } from "../model/timeText";
import type { PublicRoomSummary } from "../types";
import { CategoryTag } from "./RoomMeta";
import { StudyStatus } from "./StudyStatus";

/**
 * 공개 그룹 목록의 카드
 *
 * 카드 전체가 공개 그룹 보기로 가는 버튼 하나다.
 * 여러 글 조각이 붙어 읽히지 않도록 카드 이름은 보이는 글을 쉼표로 이어 따로 만든다.
 * 내가 들어간 그룹은 시험·목표 태그 옆에 표시를 두고, 색만으로 구분되지 않게 글자도 함께 쓴다.
 * 좁은 화면에서 이번 주 평균과 공부 상태가 한 줄에 들어가지 않으면 공부 상태가 다음 줄로 내려간다.
 */
export function PublicRoomCard({
  room,
  onOpen,
}: {
  room: PublicRoomSummary;
  onOpen: (roomId: number) => void;
}) {
  const { t } = useTranslation("group-room");
  const weeklyAverage = formatHoursMinutes(room.weeklyAverageSec);
  const label = [
    room.name,
    ...(room.member ? [t("publicRoomCard.joined")] : []),
    joinPolicyText(room.joinPolicy ?? "approval"),
    memberCountText(room.memberCount),
    room.categoryLabel,
    t("publicRoomCard.aria.weeklyAverage", { duration: weeklyAverage }),
    studyingCountText(room.studyingCount),
  ].join(", ");
  return (
    <button
      type="button"
      aria-label={label}
      // Amplitude 클릭 자동 수집이 싣는 그룹 이름 글자와 aria-label을 가린다.
      data-amp-mask
      data-amp-mask-attributes="aria-label"
      // Sentry 클릭 기록은 aria-label 대신 이 이름을 적는다.
      data-sentry-element="PublicRoomCard"
      onClick={() => onOpen(room.roomId)}
      className="flex w-full flex-col gap-2 rounded-xl bg-muted px-4 py-3.5 text-left shadow-sb-card focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="min-w-0 truncate text-base leading-5.5 font-bold text-foreground">
          {room.name}
        </span>
        <span className="shrink-0 text-[13px] leading-5 font-semibold text-muted-foreground">
          {memberCountText(room.memberCount)}
        </span>
      </span>
      <span className="flex w-full flex-wrap items-center gap-1">
        <CategoryTag label={room.categoryLabel} />
        {room.member && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-subtle py-px pr-1.75 pl-1.25 text-[11px] leading-4 font-bold text-brand-subtle-text">
            <Check aria-hidden="true" size={11} strokeWidth={3} className="shrink-0" />
            {t("publicRoomCard.joined")}
          </span>
        )}
        <JoinPolicyChip policy={room.joinPolicy} />
      </span>
      <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] leading-5 text-muted-foreground">
          <Trans
            t={t}
            i18nKey="publicRoomCard.weeklyAverage"
            values={{ duration: weeklyAverage }}
            components={{ value: <span className="font-bold text-foreground" /> }}
          />
        </span>
        <StudyStatus count={room.studyingCount} />
      </span>
    </button>
  );
}
