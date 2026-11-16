import { useTranslation } from "react-i18next";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/features/records/recordsFormat";

import { tierAt } from "../../model/earnTier";
import { formatSignedPoints } from "../../model/formatPoints";
import type { EarnToday } from "../../types";
import { EarnIcon } from "./EarnIcon";

/**
 * 공부 시간으로 받는 포인트의 규칙과 오늘 진행 막대
 *
 * 그룹 공부방에서 같이 하면 더 받는다는 것은 제목 옆 안내 버튼을 눌러야 보인다.
 * 같이 값은 혼자 값과 같은 지금 구간의 값이라 하루 순공이 쌓여 구간이 바뀌면 함께 바뀐다.
 * 구간을 주지 않는 서버이거나 같이 값이 혼자 값보다 크지 않으면 안내 버튼을 두지 않는다.
 */
export function StudyRow({ study }: { study: EarnToday["study"] }) {
  const { t } = useTranslation("points-earn");
  const percent = Math.min(100, Math.round((study.focusSec / study.capSec) * 100));
  const today = formatDuration(study.focusSec);
  const max = formatDuration(study.capSec);
  const tier = study.tiers === undefined ? null : tierAt(study.tiers, study.focusSec);
  const togetherPoints =
    tier !== null && tier.togetherPoints > tier.soloPoints ? tier.togetherPoints : null;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-bg-layer-2 p-3">
      <EarnIcon name="study" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-sm font-bold break-keep">
          <span>
            {t("study.every", { duration: formatDuration(study.unitSec) })}{" "}
            <span className="text-primary">{formatSignedPoints(study.pointsPerUnit)}</span>
          </span>
          {togetherPoints !== null && (
            <InfoTooltip label={t("study.togetherGuide")} iconSize={14}>
              {t("study.togetherRule", {
                duration: formatDuration(study.unitSec),
                points: formatSignedPoints(togetherPoints),
              })}
            </InfoTooltip>
          )}
        </span>
        <Progress
          value={percent}
          aria-label={t("study.aria", { done: today, max })}
          className="h-1.5 bg-brand-subtle"
        />
        <span className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
          <span>{t("study.today", { duration: today })}</span>
          <span>{t("study.max", { duration: max })}</span>
        </span>
      </div>
    </div>
  );
}
