import { useEffect, useId, useRef } from "react";

import {
  trackRankingGainCardShown,
  trackRankingGainCardTapped,
  type StudyRoomType,
} from "@/lib/amplitude";

import { formatRank } from "../model/format";
import { formatRise, formatRiseSpoken, type GainCardView } from "./gainView";

/**
 * 공부 결과 랭킹 카드
 *
 * 이번 공부로 오른 주간 순공 순위와 함께 오른 다른 판을 칩으로 보인다.
 * 응답이 온 뒤에야 그려지므로 자리를 미리 잡지 않고 떠오르며 나타난다.
 * 보일 때와 누를 때 이벤트를 남기고, 어디로 갈지는 결과 화면이 정한다.
 */
export function RankingGainCard({
  view,
  roomType,
  onOpen,
}: {
  view: GainCardView;
  roomType: StudyRoomType;
  onOpen: () => void;
}) {
  const titleId = useId();
  // StrictMode가 effect를 두 번 돌려도 노출은 한 번만 센다.
  const shownRef = useRef(false);
  const chipCount = view.chips.length;

  useEffect(() => {
    if (shownRef.current) {
      return;
    }
    shownRef.current = true;
    trackRankingGainCardShown({ delta: view.delta, chipCount, roomType });
  }, [view.delta, chipCount, roomType]);

  return (
    <section
      aria-labelledby={titleId}
      // 시안의 테두리는 카드 밖으로 두른 2px 선이다.
      // 안쪽 테두리로 그리고 좌우 여백을 그만큼 줄여 글자 자리를 시안과 맞춘다.
      className="rounded-xl border-2 border-primary/50 bg-muted px-4 pt-2.5 pb-3 shadow-sb-card animate-[result-fade-up_0.4s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[15px] leading-4.5 font-extrabold text-foreground">
          랭킹이 올랐어요
        </h2>
        <button
          type="button"
          onClick={() => {
            trackRankingGainCardTapped(roomType);
            onOpen();
          }}
          // 보이는 글자는 16px 높이라 위아래로 넓혀 44px을 맞춘다.
          className="relative shrink-0 rounded-sm text-[13px] leading-4 font-bold text-primary before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        >
          {/* 화면 낭독기가 화살표까지 읽지 않도록 이름에서 뺀다. */}
          랭킹 보기 <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] leading-4 text-muted-foreground">주간 순공</span>
        <span className="text-[18px] leading-5.5 font-extrabold text-foreground">
          {`${formatRank(view.before)}위 → ${formatRank(view.after)}위`}
        </span>
        <span className="rounded-sm bg-feedback-success/12 px-2 py-1 text-xs leading-3.5 font-extrabold text-rank-rise">
          <span aria-hidden="true">{formatRise(view.delta)}</span>
          <span className="sr-only">{formatRiseSpoken(view.delta)}</span>
        </span>
      </p>
      {view.chips.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {view.chips.map((chip) => (
            <li
              key={chip.key}
              // 공백은 화면 낭독기가 이름과 숫자를 떼어 읽도록 남기고, 보이는 간격은 gap이 정한다.
              className="flex items-center gap-1 rounded-full bg-bg-layer-2 px-2.5 py-1 text-[13px] leading-4 text-muted-foreground"
            >
              {chip.label}{" "}
              <span aria-hidden="true" className="text-[10px] leading-3 font-bold text-rank-rise">
                {formatRise(chip.delta)}
              </span>
              <span className="sr-only">{formatRiseSpoken(chip.delta)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
