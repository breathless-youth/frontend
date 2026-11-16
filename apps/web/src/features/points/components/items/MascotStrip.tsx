import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { WornAccessory } from "@/components/mascot/types";
import { cn } from "@/lib/utils";

import type { Mascot, MascotId } from "../../types";
import { MascotThumb } from "../shared/MascotThumb";

/** 마스코트 7종을 꾸며 둔 모습으로 한 줄에 보이고, 잠긴 것은 소품 없이 흐리게 자물쇠와 함께 둔다. */
export function MascotStrip({
  mascots,
  worn,
  pickedId,
  onPick,
}: {
  mascots: Mascot[];
  /** 마스코트마다 끼고 있는 소품이며 없는 마스코트는 소품 없이 그린다. */
  worn: ReadonlyMap<MascotId, readonly WornAccessory[]>;
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
                mascot.unlocked ? "border border-border bg-muted" : "bg-muted",
                picked && "border-2 border-primary",
              )}
            >
              <MascotThumb
                id={mascot.id}
                locked={!mascot.unlocked}
                accessories={worn.get(mascot.id)}
                className="size-12"
              />
              {!mascot.unlocked && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.75 -bottom-0.75 flex size-4.5 items-center justify-center rounded-full bg-muted"
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
