import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/features/records/recordsFormat";

import type { Mascot } from "../../types";

/** 잠긴 마스코트를 골랐을 때 소품 격자 대신 남은 시간과 모으는 길을 보인다. */
export function LockedMascotPanel({
  mascot,
  name,
  totalFocusSec,
  onCollect,
}: {
  mascot: Mascot;
  name: string;
  totalFocusSec: number;
  onCollect: () => void;
}) {
  const { t } = useTranslation("points-items");
  const ratio = Math.min(totalFocusSec / mascot.unlockFocusSec, 1);
  const percent = Math.floor(ratio * 100);
  return (
    <div className="flex flex-1 flex-col items-center gap-3 text-center">
      <h2 className="text-lg font-bold break-keep">{t(`locked.title.${mascot.id}`)}</h2>
      <p className="text-sm break-keep text-muted-foreground">
        {t("locked.hint", { remaining: formatDuration(mascot.unlockFocusSec - totalFocusSec) })}
      </p>
      <span
        role="img"
        aria-label={t("locked.progress", { name, percent })}
        className="block h-2 w-full overflow-hidden rounded-full bg-brand-subtle"
      >
        <span className="block h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
      <Button variant="secondary" size="xl" className="mt-auto w-full" onClick={onCollect}>
        {t("locked.collect")}
      </Button>
    </div>
  );
}
