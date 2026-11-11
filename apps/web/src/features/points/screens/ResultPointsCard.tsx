import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { formatDuration } from "@/features/records/recordsFormat";

import { CoinIcon } from "../components/shared/CoinIcon";
import { MascotImage } from "../components/shared/MascotImage";
import { formatSignedPoints } from "../model/formatPoints";
import type { SessionReward } from "../types";

/**
 * 공부 끝 결과의 포인트 칸
 *
 * 받은 포인트가 있으면 포인트 줄과 다음 마스코트 줄을, 하루 상한을 채워 0이면 마스코트 줄만 그린다.
 * `reward`가 null이거나 보일 줄이 하나도 없으면 아무것도 그리지 않는다.
 */
export function ResultPointsCard({
  reward,
  onOpenShop,
}: {
  reward: SessionReward | null;
  onOpenShop: () => void;
}) {
  if (reward === null || (reward.earned <= 0 && reward.nextMascot === null)) {
    return null;
  }
  return (
    <Card className="flex flex-col gap-3 px-4 py-3.5 shadow-sb-card">
      {reward.earned > 0 && <EarnedRow reward={reward} />}
      {reward.nextMascot !== null && (
        <NextMascotRow
          next={reward.nextMascot}
          bordered={reward.earned > 0}
          onOpenShop={onOpenShop}
        />
      )}
    </Card>
  );
}

function EarnedRow({ reward }: { reward: SessionReward }) {
  const { t } = useTranslation("points-result");
  const ratio = reward.capSec > 0 ? reward.todayFocusSec / reward.capSec : 0;
  return (
    <div className="flex items-center gap-3">
      <CoinIcon size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-base font-extrabold text-foreground">
          {t("earned", { points: formatSignedPoints(reward.earned) })}
        </span>
        <ProgressBar
          ratio={ratio}
          label={t("todayProgress", {
            max: formatDuration(reward.capSec),
            today: formatDuration(reward.todayFocusSec),
          })}
        />
        <span className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{t("today", { duration: formatDuration(reward.todayFocusSec) })}</span>
          <span>{t("max", { duration: formatDuration(reward.capSec) })}</span>
        </span>
      </div>
    </div>
  );
}

function NextMascotRow({
  next,
  bordered,
  onOpenShop,
}: {
  next: NonNullable<SessionReward["nextMascot"]>;
  bordered: boolean;
  onOpenShop: () => void;
}) {
  const { t } = useTranslation("points-result");
  const { t: tPoints } = useTranslation("points");
  const name = tPoints(`mascots.${next.id}`);
  const percent = Math.round(Math.min(1, Math.max(0, next.progress)) * 100);
  return (
    <div className={`flex items-center gap-3 ${bordered ? "border-t border-border pt-3" : ""}`}>
      <MascotImage id={next.id} locked size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-bold text-foreground">
          {t("nextMascot", { name, duration: formatDuration(next.remainingSec) })}
        </span>
        <ProgressBar ratio={next.progress} label={t("nextProgress", { name, percent })} />
      </div>
      <button
        type="button"
        onClick={onOpenShop}
        className="-mr-2 flex min-h-11 items-center px-2 text-[13px] font-bold whitespace-nowrap text-primary"
      >
        {t("openShop")} ›
      </button>
    </div>
  );
}

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const width = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <span
      role="img"
      aria-label={label}
      className="block h-1.5 overflow-hidden rounded-full bg-primary/15"
    >
      <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
    </span>
  );
}
