import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { IllustMedal } from "@/features/ranking/icons";

import { formatPoints } from "../../model/formatPoints";
import type { EarnToday, MedalReward } from "../../types";

/** 새 랭킹 메달이 있으면 받기 버튼을, 없으면 안내를 보인다. 메달별 포인트는 제목 옆 안내 버튼의 표로 본다. */
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
  const total = medals.reduce((sum, medal) => sum + medal.reward, 0);
  const summary = medals
    .map((m) => `${t(`medal.period.${m.period}`)} ${t("medal.rank", { rank: m.rank })}`)
    .join(" · ");
  const guide = (
    <InfoTooltip label={t("medal.guide")}>
      <RateTable rates={rates} />
    </InfoTooltip>
  );
  return (
    <section
      aria-label={t("medal.title", { count: medals.length })}
      className="flex flex-col rounded-xl bg-muted px-4 pt-3.5 pb-3 shadow-sb-card"
    >
      <div className="flex items-center gap-3">
        {medals.length > 0 ? (
          <>
            <span className="flex shrink-0">
              {medals.slice(0, 3).map((medal, i) => (
                <span key={`${medal.period}-${medal.rank}`} className={i > 0 ? "-ml-2.5" : ""}>
                  <IllustMedal rank={medal.rank} size={36} />
                </span>
              ))}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {t("medal.title", { count: medals.length })}
                {guide}
              </span>
              <span className="text-xs break-keep text-muted-foreground">{summary}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={onClaim}
              className="min-h-11 shrink-0 rounded-md bg-primary px-3 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {t("medal.claim", { points: `+${formatPoints(total)}` })}
            </button>
          </>
        ) : (
          <>
            <span className="flex shrink-0 opacity-45 grayscale">
              <IllustMedal rank={1} size={36} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {t("medal.none")}
                {guide}
              </span>
              <span className="text-xs break-keep text-muted-foreground">
                {t("medal.noneHint")}
              </span>
            </span>
            <Link
              to="/ranking"
              className="flex min-h-11 shrink-0 items-center text-[13px] font-bold text-primary"
            >
              {t("medal.ranking")}
            </Link>
          </>
        )}
      </div>
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
          {([1, 2, 3] as const).map((rank) => (
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
