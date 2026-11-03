import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { trackRankingGainCardShown, type StudyRoomType } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";

import { formatRise, formatRiseSpoken, type GainCardView } from "./gainView";

/**
 * 공부 결과 랭킹 카드
 *
 * 이번 공부로 주간 순공이 오른 계단 수와 함께 오른 다른 판을 칩으로 보인다.
 * 순위 숫자는 참여 인원을 드러내 오른 계단 수만 쓴다.
 * 응답이 온 뒤에야 그려지므로 자리를 미리 잡지 않고 떠오르며 나타난다.
 * 보일 때 이벤트를 남긴다.
 */
export function RankingGainCard({
  view,
  roomType,
}: {
  view: GainCardView;
  roomType: StudyRoomType;
}) {
  const titleId = useId();
  const { t } = useTranslation("ranking");
  // StrictMode가 effect를 두 번 돌려도 노출은 한 번만 센다.
  const shownRef = useRef(false);
  const chipCount = view.chips.length;

  useEffect(() => {
    if (shownRef.current) {
      return;
    }
    shownRef.current = true;
    trackRankingGainCardShown({ delta: view.delta, chipCount, roomType });
    haptic("light");
  }, [view.delta, chipCount, roomType]);

  return (
    <section
      aria-labelledby={titleId}
      // 테두리를 없애며 좌우 여백을 그 두께만큼 늘려 글자 자리를 지킨다.
      className="rounded-xl bg-muted px-4.5 pt-2.5 pb-3 shadow-sb-card animate-[result-fade-up_0.4s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
    >
      <h2 id={titleId} className="text-[15px] leading-4.5 font-extrabold text-foreground">
        {t("gainCard.title")}
      </h2>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] leading-4 text-muted-foreground">
          {t("gainCard.weeklyFocus")}
        </span>
        <span className="text-base leading-5 font-extrabold text-rank-rise">
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
