import type { RankingBoardResponse, RankingGoalExample } from "@focusmakers/types";

import { formatDuration } from "@/features/records/recordsFormat";

import { isOffSlot } from "../model/board";
import { formatRank } from "../model/format";
import {
  cardTitle,
  competitionLine,
  offSlotHeadline,
  previousResultLabel,
  resetNotice,
} from "../model/labels";
import { CardShell, Deadline, FocusStartButton } from "./RankCard";

const HEADLINE =
  "mt-2.5 text-2xl leading-8 font-extrabold tracking-[-0.7px] break-keep text-pretty text-foreground";

function FirstStudyHeadline() {
  return (
    <p className={HEADLINE}>
      첫 공부를 마치면
      <br />
      바로 순위가 생겨요
    </p>
  );
}

/**
 * 기간이 막 새로 시작돼 아직 내 기록이 없는 판의 카드
 *
 * 지금 구간이 아닌 시간대 판은 지금 공부해도 그 판에 들어가지 않아 순위 대신 그 구간을 말한다.
 * 지금 시작하면 받을 순위가 오지 않으면 순위를 짐작해 적지 않고 처음 카드의 큰 문구를 쓴다.
 */
export function ResetCard({
  board,
  deadline,
  serverNow,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  deadline: string | null;
  serverNow: number;
  onFocusStart: () => void;
}) {
  return (
    <CardShell title={cardTitle(board)} aside={deadline !== null && <Deadline text={deadline} />}>
      {isOffSlot(board, serverNow) ? (
        <p className={HEADLINE}>{offSlotHeadline(board)}</p>
      ) : board.startNowRank === null ? (
        <FirstStudyHeadline />
      ) : (
        <p className={HEADLINE}>
          지금 시작하면 <span className="text-primary">{formatRank(board.startNowRank)}위</span>
          예요
        </p>
      )}
      <p className="mt-2.5 text-[13px] leading-[15px] font-semibold break-keep text-pretty text-muted-foreground">
        {resetNotice(board)}
      </p>
      <FocusStartButton onClick={onFocusStart} className="mt-3.5" />
    </CardShell>
  );
}

/**
 * 직전 기간 최종 결과 카드
 *
 * 기록 보기는 랭킹 기록 모두 보기로 간다.
 * 글자 버튼은 보이는 높이가 15px이라 누르는 영역을 위아래로 넓혀 45px로 맞춘다.
 */
export function PreviousResultCard({
  previous,
  onShowRecords,
}: {
  previous: RankingBoardResponse;
  onShowRecords: () => void;
}) {
  if (previous.me === null || previous.period === null) {
    return null;
  }
  const label = previousResultLabel(previous.period);
  return (
    <section
      aria-label={label}
      className="flex items-center justify-between gap-3 rounded-xl bg-muted px-[18px] py-4 shadow-sb-card"
    >
      <div className="min-w-0">
        <p className="text-xs leading-[14px] text-muted-foreground">{label}</p>
        <p className="mt-1 text-base leading-[19px] font-extrabold text-foreground">
          {formatRank(previous.me.rank)}위 · {formatDuration(previous.me.value)}
        </p>
      </div>
      <button
        type="button"
        onClick={onShowRecords}
        className="relative shrink-0 text-[13px] leading-[15px] font-bold text-primary before:absolute before:-inset-x-3 before:-inset-y-[15px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)]"
      >
        기록 보기 ›
      </button>
    </section>
  );
}

/**
 * 이 판에 아직 내 기록이 없을 때의 카드
 *
 * 지금 구간이 아닌 시간대 판은 첫 공부 안내 대신 그 구간에 공부하라고 말한다.
 * 연속 공부는 하루 순공 10분부터 하루로 세서, 공부를 했어도 순위가 없을 수 있어 그 기준을 말한다.
 */
export function FirstCard({
  board,
  deadline,
  serverNow,
  onFocusStart,
}: {
  board: RankingBoardResponse;
  deadline: string | null;
  serverNow: number;
  onFocusStart: () => void;
}) {
  return (
    <CardShell
      title="아직 내 순위가 없어요"
      titleClassName="font-normal text-muted-foreground"
      aside={deadline !== null && <Deadline text={deadline} />}
    >
      {isOffSlot(board, serverNow) ? (
        <p className={HEADLINE}>{offSlotHeadline(board)}</p>
      ) : board.type === "MAX_STREAK" ? (
        <p className={HEADLINE}>
          하루 10분 이상 공부하면
          <br />
          순위가 생겨요
        </p>
      ) : (
        <FirstStudyHeadline />
      )}
      <p className="mt-2.5 text-[13px] leading-[15px] font-semibold break-keep text-pretty text-muted-foreground">
        {competitionLine(board)}
      </p>
      <FocusStartButton onClick={onFocusStart} className="mt-3.5" />
    </CardShell>
  );
}

/** 시안에 있는 구간만 이 순서로 보인다. */
const SHOWN_PERCENTS = [50, 20, 5] as const;

/**
 * 지난주 분포로 본 구간별 필요 순공
 *
 * 서버는 상위 1·5·10·20·30·50%를 오름차순으로 보내고, 그중 50·20·5%만 이 순서로 보인다.
 * 없는 구간은 건너뛴다.
 * 서버 값은 분 단위라 시간을 `3시간 27분`처럼 한 줄로 쓰고, 시간 칸은 가장 긴 줄에 맞춘다.
 * 줄마다 같은 열을 쓰도록 subgrid로 묶고, subgrid가 없는 웹뷰에서는 줄마다 따로 잡는다.
 * 막대 길이는 `100 − 상위 %`다.
 */
export function GoalExamplesCard({ examples }: { examples: readonly RankingGoalExample[] }) {
  const shown = SHOWN_PERCENTS.flatMap((percent) =>
    examples.filter((example) => example.percent === percent),
  );
  if (shown.length === 0) {
    return null;
  }
  return (
    <CardShell title="이번 주에 이만큼 하면" titleClassName="font-bold text-muted-foreground">
      <ul className="mt-[18px] grid grid-cols-[auto_1fr_66px] gap-x-3 gap-y-6">
        {shown.map((example) => (
          <li
            key={example.percent}
            className="col-span-3 grid grid-cols-[auto_1fr_66px] items-center gap-x-3 supports-[grid-template-columns:subgrid]:grid-cols-subgrid"
          >
            <span className="text-sm leading-4 font-extrabold whitespace-nowrap text-foreground">
              {formatDuration(example.value)}
            </span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-xs bg-bg-layer-2">
              <span
                className="block h-full rounded-xs bg-gradient-to-r from-primary/50 to-primary"
                style={{ width: `${100 - example.percent}%` }}
              />
            </span>
            <span className="text-right text-[13px] leading-[15px] font-bold text-primary">
              상위 {example.percent}%
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
