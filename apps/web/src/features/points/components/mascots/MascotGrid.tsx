import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

import type { WornAccessory } from "@/components/mascot/types";

import { formatPoints } from "../../model/formatPoints";
import type { Mascot, MascotId } from "../../types";
import { MascotThumb } from "../shared/MascotThumb";

/**
 * 마스코트 3열 격자
 *
 * 연 마스코트는 눌러 고르고, 잠긴 마스코트는 눌러 남은 시간을 본다.
 * 연 마스코트는 고르지 않았어도 그 마스코트에 꾸며 둔 소품을 입혀 그린다.
 * 잠긴 마스코트도 이름을 보이고, 다음 차례인 칸만 점선 테두리로 구분한다.
 */
export function MascotGrid({
  mascots,
  worn,
  totalFocusSec,
  onSelect,
  onLockedPress,
}: {
  mascots: Mascot[];
  /** 마스코트마다 끼고 있는 소품이며 없는 마스코트는 소품 없이 그린다. */
  worn: ReadonlyMap<MascotId, readonly WornAccessory[]>;
  totalFocusSec: number;
  onSelect: (id: Mascot["id"]) => void;
  onLockedPress: (mascot: Mascot) => void;
}) {
  const { t } = useTranslation("points-mascots");
  const { t: tPoints } = useTranslation("points");
  const nextId = mascots.find((mascot) => !mascot.unlocked && mascot.price === null)?.id;
  return (
    <ul className="grid grid-cols-3 gap-2.5">
      {mascots.map((mascot) => {
        const name = tPoints(`mascots.${mascot.id}`);
        const remaining =
          mascot.price === null
            ? t("remaining", {
                time: formatDuration(Math.max(mascot.unlockFocusSec - totalFocusSec, 0)),
              })
            : formatPoints(mascot.price);
        return (
          <li key={mascot.id} className="contents">
            <button
              type="button"
              aria-pressed={mascot.unlocked ? mascot.selected : undefined}
              aria-label={
                mascot.unlocked
                  ? undefined
                  : mascot.price === null
                    ? t("lockedLabel", { name, remaining })
                    : t("purchase.lockedPriceLabel", { name, price: remaining })
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
              {/* 판 한 변 90px이면 몸은 예전 그림과 같은 64px이고 좁은 폰에서는 칸 폭만큼 줄어든다. */}
              <MascotThumb
                id={mascot.id}
                locked={!mascot.unlocked}
                accessories={worn.get(mascot.id)}
                className="w-full max-w-22.5"
                badge={
                  !mascot.unlocked && (
                    <Lock
                      size={18}
                      strokeWidth={2}
                      className="absolute -right-1 -bottom-1 rounded-full bg-muted p-0.75 text-muted-foreground"
                    />
                  )
                }
              />
              <span aria-hidden={!mascot.unlocked} className="text-sm font-bold">
                {name}
              </span>
              <span
                aria-hidden={!mascot.unlocked}
                className={cn(
                  "text-xs break-keep",
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
