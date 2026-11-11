import { ChevronRight, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/features/records/recordsFormat";

import type { Mascot } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/** 아직 잠긴 다음 마스코트와 열리기까지의 진행 */
export function NextMascotCard({
  mascot,
  totalFocusSec,
  onOpen,
}: {
  mascot: Mascot;
  totalFocusSec: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation(["points-shop", "points"]);
  const name = t(`points:mascots.${mascot.id}`);
  const remaining = Math.max(0, mascot.unlockFocusSec - totalFocusSec);
  const percent = Math.min(100, Math.floor((totalFocusSec / mascot.unlockFocusSec) * 100));
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("points-shop:nextMascot.open", { name })}
      className="flex min-h-22 w-full items-center gap-3.5 rounded-lg bg-muted px-4 py-3.5 text-left shadow-sb-card"
    >
      <span className="relative flex size-15 shrink-0 items-center justify-center rounded-2xl bg-bg-layer-2">
        <MascotImage id={mascot.id} locked size={50} />
        <Lock
          size={18}
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 rounded-full bg-muted p-0.75 text-muted-foreground"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-muted-foreground">
            {t("points-shop:nextMascot.label", { name })}
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-tertiary" />
        </span>
        <span className="text-[15px] leading-5 font-bold">
          {t("points-shop:nextMascot.remaining", { duration: formatDuration(remaining) })}
        </span>
        <span
          role="img"
          aria-label={t("points-shop:nextMascot.progress", { name, percent })}
          className="block h-1.5 overflow-hidden rounded-full bg-brand-subtle"
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      </span>
    </button>
  );
}
