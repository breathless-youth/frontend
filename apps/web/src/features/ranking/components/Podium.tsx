import type { MedalRank, RankingBoardResponse, RankingType } from "@focusmakers/types";
import { useId } from "react";

import { cn } from "@/lib/utils";

import { IllustCrown, IllustMedal, IllustMedalRing } from "../icons";
import { MEDAL_MIN_SEC, isTimeType } from "../model/board";
import { formatRank, formatValue } from "../model/format";
import { podiumCaption, podiumTitle } from "../model/labels";
import { podiumStands, type PodiumRow } from "../model/podium";
import { Nickname } from "./Nickname";
import { RankAvatar } from "./RankAvatar";

/**
 * 자리별 모양
 *
 * 화면 순서는 2·1·3이고 문서 순서는 1·2·3이라 화면 낭독기는 순위대로 읽는다.
 * 테 지름은 아바타 지름에 양쪽으로 틈 2px과 테 두께 3px씩을 더한 값이다.
 */
const SPOT = {
  1: { order: "order-2", stand: "h-10 pt-[9px]", medal: 22, avatar: "lg", ring: 66 },
  2: { order: "order-1", stand: "h-7 pt-[5px]", medal: 18, avatar: "md", ring: 56 },
  3: { order: "order-3", stand: "h-5 pt-px", medal: 18, avatar: "md", ring: 56 },
} as const;

/**
 * TOP 3 시상대
 *
 * 왕관은 시안처럼 제목 줄 높이까지 올려 가운데에 둔다.
 * 메달을 받은 자리는 아바타를 그 메달 색 테로 두른다.
 * 순공·시간대 판에서 30분이 안 된 자리는 메달과 테 없이 흐린 순위 숫자만 놓는다.
 * 그런 자리가 하나라도 있으면 아래에 안내 한 줄을 단다.
 * 일수 판은 같은 일수 묶음의 대표가 서고, 이름 아래에 같은 일수인 나머지 인원을 쓴다.
 */
export function Podium({ board, elapsedSec }: { board: RankingBoardResponse; elapsedSec: number }) {
  const titleId = useId();
  const stands = podiumStands(board, elapsedSec);
  const caption = podiumCaption(board);
  const medalless = (row: PodiumRow | undefined) =>
    row !== undefined && isTimeType(board.type) && row.display < MEDAL_MIN_SEC;

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-xl bg-brand-subtle ring-1 ring-chart-heat-1 ring-inset"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <h2 id={titleId} className="text-xs leading-[14px] font-extrabold text-muted-foreground">
          {podiumTitle(board)}
        </h2>
        {caption !== null && (
          <p className="text-xs leading-[14px] font-semibold text-muted-foreground">{caption}</p>
        )}
      </div>
      {/* 테가 아바타 밖으로 5px 나오므로 왕관 아래와 닉네임 위 틈을 2px씩 넓힌다. */}
      {/* 그만큼 목록을 4px 더 올려 카드 높이를 유지한다. */}
      <ol className="-mt-[17px] grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2 px-3">
        {stands.map(({ spot, label, row }) => (
          <PodiumSpot
            key={spot}
            spot={spot}
            label={label}
            row={row}
            type={board.type}
            medalless={medalless(row)}
          />
        ))}
      </ol>
      {stands.some((stand) => medalless(stand.row)) && (
        <p className="border-t border-border bg-muted/70 pt-2.5 pb-[11px] text-center text-xs leading-[14px] text-muted-foreground">
          메달은 30분 이상부터 받아요
        </p>
      )}
    </section>
  );
}

function PodiumSpot({
  spot,
  label,
  row,
  type,
  medalless,
}: {
  spot: MedalRank;
  label: string;
  row: PodiumRow | undefined;
  type: RankingType;
  medalless: boolean;
}) {
  const look = SPOT[spot];
  const first = spot === 1;
  return (
    <li className={cn("flex min-w-0 flex-col items-center", look.order)}>
      <span className="sr-only">{label}</span>
      {first && <IllustCrown className="mb-2" />}
      {row === undefined ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-bg-layer-2 font-extrabold text-text-tertiary",
            first ? "size-14 text-[19px]" : "size-[46px] text-base",
          )}
        >
          ?
        </span>
      ) : (
        <span className="relative inline-flex">
          <RankAvatar nickname={row.nickname} me={row.me} meLetter="initial" size={look.avatar} />
          {!medalless && (
            <IllustMedalRing
              rank={spot}
              size={look.ring}
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          )}
        </span>
      )}
      <div className="mt-2 flex w-full min-w-0 items-center justify-center">
        {row === undefined ? (
          // 1위 자리 닉네임 줄은 15px이라 빈자리 ?도 같은 줄 높이를 써서 카드 높이를 맞춘다.
          <span
            className={cn(
              "text-xs font-bold text-text-tertiary",
              first ? "leading-[15px]" : "leading-[14px]",
            )}
          >
            ?
          </span>
        ) : (
          <>
            <Nickname
              name={row.nickname}
              className={cn(
                "text-center text-foreground",
                first
                  ? "text-[13px] leading-[15px] font-extrabold"
                  : "text-xs leading-[14px] font-bold",
              )}
            />
            {/* 내 자리는 내 첫 글자의 파란 아바타로만 보이므로 나 표시는 화면 낭독기에만 읽힌다. */}
            {row.me && <span className="sr-only">나</span>}
          </>
        )}
      </div>
      {row !== undefined && row.othersCount > 0 && (
        <p
          className={cn(
            "mt-0.5 font-medium whitespace-nowrap text-muted-foreground tabular-nums",
            first ? "text-xs leading-[14px]" : "text-[11px] leading-[13px]",
          )}
        >
          외 {formatRank(row.othersCount)}명
        </p>
      )}
      {row === undefined ? (
        // 세 자리가 모두 비면 가장 높은 자리에도 값 줄이 없어 카드가 낮아지므로, 값 줄만큼 빈칸을 남긴다.
        <div
          aria-hidden="true"
          data-value-placeholder=""
          className={cn("mt-0.5", first ? "h-[14px]" : "h-[13px]")}
        />
      ) : (
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1 whitespace-nowrap tabular-nums",
            first
              ? "text-xs leading-[14px] font-extrabold"
              : "text-[11px] leading-[13px] font-bold",
            medalless ? "text-muted-foreground" : "text-primary",
          )}
        >
          {row.focusing && (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "rounded-full bg-feedback-success",
                  first ? "size-1.5" : "size-[5px]",
                )}
              />
              <span className="sr-only">집중 중</span>
            </>
          )}
          {formatValue(type, row.display)}
        </p>
      )}
      <div className={cn("mt-1.5 flex w-full justify-center rounded-t-md bg-muted", look.stand)}>
        {medalless || row === undefined ? (
          // 시안처럼 메달 자리보다 1.5px 아래에 둔다.
          <span
            aria-hidden="true"
            className="mt-[1.5px] text-base leading-[19px] font-extrabold text-text-tertiary"
          >
            {spot}
          </span>
        ) : (
          <IllustMedal rank={spot} size={look.medal} />
        )}
      </div>
    </li>
  );
}
