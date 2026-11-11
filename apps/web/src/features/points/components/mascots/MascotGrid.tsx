import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

import type { Mascot } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 마스코트 3열 격자
 *
 * 연 마스코트는 눌러 고르고, 잠긴 마스코트는 눌러 남은 시간을 본다.
 * 가장 가까운 잠긴 것만 이름을 보이고 그 뒤의 잠긴 것은 `???`로 숨겨 다음 차례를 궁금하게 한다.
 */
export function MascotGrid({
  mascots,
  totalFocusSec,
  onSelect,
  onLockedPress,
}: {
  mascots: Mascot[];
  totalFocusSec: number;
  onSelect: (id: Mascot["id"]) => void;
  onLockedPress: (mascot: Mascot) => void;
}) {
  const { t } = useTranslation("points-mascots");
  const { t: tPoints } = useTranslation("points");
  const nextId = mascots.find((mascot) => !mascot.unlocked)?.id;
  return (
    <ul className="grid grid-cols-3 gap-2.5">
      {mascots.map((mascot) => {
        const name = tPoints(`mascots.${mascot.id}`);
        const hidden = !mascot.unlocked && mascot.id !== nextId;
        const shownName = hidden ? t("hiddenName") : name;
        const remaining = t("remaining", {
          time: formatDuration(Math.max(mascot.unlockFocusSec - totalFocusSec, 0)),
        });
        return (
          <li key={mascot.id} className="contents">
            <button
              type="button"
              aria-pressed={mascot.unlocked ? mascot.selected : undefined}
              aria-label={
                mascot.unlocked ? undefined : t("lockedLabel", { name: shownName, remaining })
              }
              onClick={() => (mascot.unlocked ? onSelect(mascot.id) : onLockedPress(mascot))}
              className={cn(
                "flex min-h-11 flex-col items-center gap-1 rounded-lg bg-muted px-1.5 py-2.5 shadow-sb-card focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
                mascot.selected
                  ? "border-2 border-primary"
                  : mascot.id === nextId
                    ? "border-2 border-dashed border-border-strong"
                    : "border border-transparent",
              )}
            >
              <span className="relative flex" aria-hidden="true">
                <MascotImage id={mascot.id} locked={!mascot.unlocked} size={64} decorative />
                {!mascot.unlocked && (
                  <Lock
                    size={18}
                    strokeWidth={2}
                    className="absolute -right-1 -bottom-1 rounded-full bg-muted p-0.75 text-muted-foreground"
                  />
                )}
              </span>
              <span aria-hidden={!mascot.unlocked} className="text-sm font-bold">
                {shownName}
              </span>
              <span
                aria-hidden={!mascot.unlocked}
                className={cn(
                  "text-xs",
                  mascot.selected ? "font-bold text-feedback-success" : "text-muted-foreground",
                )}
              >
                {mascot.unlocked
                  ? tPoints(mascot.selected ? "status.selected" : "status.selectable")
                  : remaining}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
