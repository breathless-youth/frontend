import { useTranslation } from "react-i18next";

import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/features/records/recordsFormat";

import { formatSignedPoints } from "../../model/formatPoints";
import type { EarnToday } from "../../types";
import { EarnIcon } from "./EarnIcon";

/** 공부 시간으로 받는 포인트의 규칙과 오늘 진행 막대 */
export function StudyRow({ study }: { study: EarnToday["study"] }) {
  const { t } = useTranslation("points-earn");
  const percent = Math.min(100, Math.round((study.focusSec / study.capSec) * 100));
  const today = formatDuration(study.focusSec);
  const max = formatDuration(study.capSec);
  return (
    <div className="flex items-center gap-3 rounded-lg bg-bg-layer-2 p-3">
      <EarnIcon name="study" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-bold break-keep">
          {t("study.every", { duration: formatDuration(study.unitSec) })}{" "}
          <span className="text-primary">{formatSignedPoints(study.pointsPerUnit)}</span>
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
