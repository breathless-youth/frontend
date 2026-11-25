import { useTranslation } from "react-i18next";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useOpenRanking } from "@/features/ranking/exposure/navigation";
import { IllustMedal } from "@/features/ranking/icons";
import { cn } from "@/lib/utils";

import { formatPoints } from "../../model/formatPoints";
import { medalsByRank, shownCount } from "../../model/medalCount";
import type { EarnToday, MedalReward } from "../../types";
import { TileButton } from "./FreeTile";

const RANKS = [1, 2, 3] as const;

/**
 * 받을 랭킹 메달을 금·은·동 순위별 개수로 보이는 줄
 *
 * 메달이 몇 개든 세 칸은 늘 그대로이고 개수 글자만 바뀌어 줄 높이가 바뀌지 않는다.
 * 없는 순위는 흐리게 두고, 메달별 포인트는 제목 옆 안내 버튼을 누르면 표로 본다.
 * 받을 메달이 있으면 합계를 받는 버튼을, 없으면 랭킹으로 가는 버튼을 둔다.
 * 포인트 화면은 홈 탭 웹뷰 안이라 랭킹은 웹 라우터가 아니라 셸의 랭킹 탭으로 간다(`useOpenRanking`).
 */
export function MedalCard({
  medals,
  rates,
  pending,
  onClaim,
}: {
  medals: MedalReward[];
  rates: EarnToday["medalRates"];
  pending: boolean;
  onClaim: () => void;
}) {
  const { t } = useTranslation("points-earn");
  const { openBoard } = useOpenRanking();
  const total = medals.reduce((sum, medal) => sum + medal.reward, 0);
  const counts = medalsByRank(medals);
  const has = medals.length > 0;
  return (
    <section
      aria-label={t("medal.title", { count: medals.length })}
      className="flex min-h-15 items-center gap-3 rounded-xl bg-muted px-3 py-2 shadow-sb-card"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-sm font-bold break-keep">
          {has ? t("medal.heading") : t("medal.none")}
          <InfoTooltip label={t("medal.guide")} iconSize={14}>
            <RateTable rates={rates} />
          </InfoTooltip>
        </span>
        <span className="flex items-center gap-3.5">
          {RANKS.map((rank) => (
            <span
              key={rank}
              className={cn(
                "flex items-center gap-1 text-[13px] font-bold tabular-nums",
                counts[rank] === 0 && "opacity-45 grayscale",
              )}
            >
              <IllustMedal rank={rank} size={20} />
              <span aria-hidden="true">×{shownCount(counts[rank])}</span>
              <span className="sr-only">{t("medal.rankCount", { rank, count: counts[rank] })}</span>
            </span>
          ))}
        </span>
      </span>
      {has ? (
        <span className="shrink-0">
          <TileButton disabled={pending} onClick={onClaim}>
            {t("medal.claim", { points: `+${formatPoints(total)}` })}
          </TileButton>
        </span>
      ) : (
        <button
          type="button"
          onClick={openBoard}
          className="flex min-h-11 shrink-0 items-center text-[13px] font-bold text-primary"
        >
          {t("medal.ranking")}
        </button>
      )}
    </section>
  );
}

const PERIODS = ["daily", "weekly", "monthly"] as const;

function RateTable({ rates }: { rates: EarnToday["medalRates"] }) {
  const { t } = useTranslation("points-earn");
  return (
    <div className="flex flex-col gap-1.5 text-xs whitespace-nowrap">
      {PERIODS.map((period) => (
        <div key={period} className="flex items-center gap-2.5">
          <span className="w-9 font-bold">
            {t(`medal.period.${period.toUpperCase() as Uppercase<typeof period>}`)}
          </span>
          {RANKS.map((rank) => (
            <span key={rank} className="flex items-center gap-0.5">
              <IllustMedal rank={rank} size={14} />
              {formatPoints(rates[period][(["gold", "silver", "bronze"] as const)[rank - 1]])}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
