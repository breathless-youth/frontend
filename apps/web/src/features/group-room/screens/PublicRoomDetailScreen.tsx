import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { RankAvatar } from "@/features/ranking/components/RankAvatar";
import { splitGraphemes } from "@/lib/graphemes";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_BAR_CLASS, BOTTOM_CTA_CLASS, BOTTOM_CTA_UNAVAILABLE_CLASS } from "../bottomCta";
import { RoomMeta } from "../components/RoomMeta";
import { TodayDesksCard } from "../components/TodayDesksCard";
import { applyBlockCopy } from "../model/limits";
import { formatHoursMinutes } from "../model/timeText";
import type { ApplyState, PublicRoomDetail } from "../types";
import { useElapsedSec } from "../useElapsedSec";

/** 소개를 접어 둘 때 보이는 글자 수이고, 테스트 환경에서는 줄 수를 측정할 수 없어 글자 수로 정한다. */
const INTRO_PREVIEW_MAX = 120;

const CARD_CLASS = "rounded-xl bg-muted shadow-sb-card";

/**
 * 공개 그룹 보기
 *
 * 들어가기 전에 소개, 그룹장, 오늘 멤버 책상을 보고 신청한다.
 * 그룹장이 수락해야 멤버가 된다는 안내는 신청하기 화면의 설명이 맡아서 아래 버튼 위에는 글을 두지 않는다.
 * 신청할 수 없는 이유는 흐린 버튼의 글자로 알린다.
 */
export function PublicRoomDetailScreen({
  room,
  applyState,
  fetchedAtMs,
  pending,
  onBack,
  onApply,
  onCancelApplication,
}: {
  room: PublicRoomDetail;
  applyState: ApplyState;
  fetchedAtMs: number;
  /** 신청이나 신청 취소를 보내는 중이면 두 번 나가지 않게 버튼을 막는다. */
  pending: boolean;
  onBack: () => void;
  onApply: () => void;
  onCancelApplication: () => void;
}) {
  const { t } = useTranslation("group-room");
  const elapsedSec = useElapsedSec(
    fetchedAtMs,
    room.members.some((member) => member.accumulating),
  );
  return (
    <main
      // 그룹 이름, 닉네임, 소개가 Amplitude 클릭 이벤트에 실리지 않게 화면 안의 글자와 aria-label을 모두 가린다.
      data-amp-mask
      data-amp-mask-attributes="aria-label"
      className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground"
    >
      <ScreenBackHeader title={room.name} onBack={onBack} />
      <div className="flex flex-col px-5">
        <div className="pt-0.5">
          <RoomMeta
            visibility="public"
            categoryLabel={room.categoryLabel}
            memberCount={room.memberCount}
          />
        </div>
        {/* 공백과 줄바꿈만 있는 소개는 빈 칸으로 보여서 빈 소개처럼 칸을 그리지 않는다. */}
        {room.intro.trim() !== "" && <IntroCard intro={room.intro.trim()} />}
        <dl className={cn(CARD_CLASS, "mt-3 px-4 py-1.5")}>
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border">
            <dt className="shrink-0 text-sm leading-5 text-muted-foreground">
              {t("publicRoomDetailScreen.owner")}
            </dt>
            <dd className="flex min-w-0 items-center gap-2">
              <RankAvatar nickname={room.ownerNickname} imageUrl={room.ownerImageUrl} size="2xs" />
              <span className="truncate text-sm leading-5 font-semibold text-foreground">
                {room.ownerNickname}
              </span>
            </dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-sm leading-5 text-muted-foreground">
              {t("publicRoomDetailScreen.weeklyAverage")}
            </dt>
            <dd className="shrink-0 text-sm leading-5 font-bold text-foreground tabular-nums">
              {formatHoursMinutes(room.weeklyAverageSec)}
            </dd>
          </div>
        </dl>
        <TodayDesksCard
          title={t("publicRoomDetailScreen.todayMembers")}
          members={room.members}
          visibility="public"
          elapsedSec={elapsedSec}
          className="mt-3"
        />
      </div>
      <div className={BOTTOM_CTA_BAR_CLASS}>
        <ApplyButton
          applyState={applyState}
          pending={pending}
          onApply={onApply}
          onCancel={onCancelApplication}
        />
      </div>
    </main>
  );
}

/**
 * 그룹 소개 칸
 *
 * 긴 소개는 앞부분만 보이고 더 보기로 한 번 펼친다.
 * 이모지 조합이 반으로 잘리지 않게 글자 단위로 자른다.
 * 줄바꿈이 많은 소개는 앞부분만으로도 길어져서 접어 둔 동안에는 줄 수도 함께 막는다.
 */
function IntroCard({ intro }: { intro: string }) {
  const { t } = useTranslation("group-room");
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const graphemes = splitGraphemes(intro);
  const collapsed = !expanded && graphemes.length > INTRO_PREVIEW_MAX;
  return (
    <section
      aria-labelledby={titleId}
      className={cn(CARD_CLASS, "mt-3.5 flex flex-col gap-1.5 p-4")}
    >
      <h2 id={titleId} className="text-[13px] leading-5 font-semibold text-muted-foreground">
        {t("publicRoomDetailScreen.intro")}
      </h2>
      <p
        className={cn(
          "text-[15px] leading-5.5 wrap-break-word whitespace-pre-line text-foreground",
          collapsed && "line-clamp-6",
        )}
      >
        {collapsed ? `${graphemes.slice(0, INTRO_PREVIEW_MAX).join("")}…` : intro}
      </p>
      {collapsed && (
        // 글자 높이만큼만 자리를 차지하면서 누르는 영역은 44px을 지키도록 위아래로 겹친다.
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="-my-2.5 flex h-11 min-w-11 items-center self-start rounded-sm text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        >
          {t("publicRoomDetailScreen.showMore")}
        </button>
      )}
    </section>
  );
}

/**
 * 아래 신청 버튼
 *
 * 이미 신청한 그룹은 같은 자리에서 신청을 취소한다.
 * 자리가 없거나 신청할 수 없을 때는 보내는 중과 구분되게 회색 버튼으로 둔다.
 */
function ApplyButton({
  applyState,
  pending,
  onApply,
  onCancel,
}: {
  applyState: ApplyState;
  pending: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("group-room");
  switch (applyState.kind) {
    case "can_apply":
      return (
        <Button
          size="xl"
          disabled={pending}
          onClick={onApply}
          className={cn(BOTTOM_CTA_CLASS, "shadow-sb-cta")}
        >
          {t("publicRoomDetailScreen.apply")}
        </Button>
      );
    case "applied":
      return (
        <Button
          size="xl"
          variant="secondary"
          disabled={pending}
          onClick={onCancel}
          className={BOTTOM_CTA_CLASS}
        >
          {t("publicRoomDetailScreen.cancelApplication")}
        </Button>
      );
    case "full":
      return (
        <Button size="xl" disabled className={cn(BOTTOM_CTA_CLASS, BOTTOM_CTA_UNAVAILABLE_CLASS)}>
          {t("publicRoomDetailScreen.apply")}
        </Button>
      );
    case "blocked":
      return (
        <Button size="xl" disabled className={cn(BOTTOM_CTA_CLASS, BOTTOM_CTA_UNAVAILABLE_CLASS)}>
          {applyBlockCopy(applyState.reason)}
        </Button>
      );
  }
}
