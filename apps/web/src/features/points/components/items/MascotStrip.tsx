import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { Mascot, MascotId } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/** 마스코트 7종을 한 줄로 보이고, 잠긴 것은 흐리게 자물쇠와 함께 둔다. */
export function MascotStrip({
  mascots,
  pickedId,
  onPick,
}: {
  mascots: Mascot[];
  pickedId: MascotId;
  onPick: (id: MascotId) => void;
}) {
  const { t } = useTranslation("points-items");
  const { t: tPoints } = useTranslation("points");
  return (
    <div
      role="group"
      aria-label={t("mascotStrip.label")}
      className="flex gap-0.5 overflow-x-auto pt-2 pb-1"
    >
      {mascots.map((mascot) => {
        const name = tPoints(`mascots.${mascot.id}`);
        const picked = mascot.id === pickedId;
        return (
          <button
            key={mascot.id}
            type="button"
            aria-label={
              !mascot.unlocked
                ? t("mascotStrip.locked", { name })
                : picked
                  ? t("mascotStrip.selected", { name })
                  : name
            }
            aria-pressed={picked}
            onClick={() => onPick(mascot.id)}
            className="flex min-h-11 w-15 shrink-0 flex-col items-center gap-1"
          >
            <span
              className={cn(
                "relative flex size-13 items-center justify-center rounded-2xl",
                mascot.unlocked ? "border bg-white" : "bg-muted",
                picked && "border-2 border-primary",
              )}
            >
              <MascotImage id={mascot.id} locked={!mascot.unlocked} size={36} decorative />
              {!mascot.unlocked && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.75 -bottom-0.75 flex size-4.5 items-center justify-center rounded-full bg-white"
                >
                  <Lock size={11} className="text-text-tertiary" />
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-[11px]",
                picked ? "font-bold text-foreground" : "text-muted-foreground",
              )}
            >
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
