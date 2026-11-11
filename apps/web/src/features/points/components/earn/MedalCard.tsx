import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { IllustMedal } from "@/features/ranking/icons";

import { formatPoints } from "../../model/formatPoints";
import type { EarnToday, MedalReward } from "../../types";

/** 새 랭킹 메달이 있으면 받기 버튼을, 없으면 안내를 보이고 아래에 메달별 포인트를 적는다. */
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
  return (
    <section
      aria-label={t("medal.title", { count: medals.length })}
      className="flex flex-col gap-3 rounded-xl bg-muted px-4 pt-3.5 pb-3 shadow-sb-card"
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
              <span className="text-sm font-bold">
                {t("medal.title", { count: medals.length })}
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
              <span className="text-sm font-bold">{t("medal.none")}</span>
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
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
        <Rate rank={1} label={t("medal.gold", { points: formatPoints(rates.gold) })} />
        <Rate rank={2} label={t("medal.silver", { points: formatPoints(rates.silver) })} />
        <Rate rank={3} label={t("medal.bronze", { points: formatPoints(rates.bronze) })} />
      </div>
    </section>
  );
}

function Rate({ rank, label }: { rank: 1 | 2 | 3; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <IllustMedal rank={rank} size={16} />
      {label}
    </span>
  );
}
