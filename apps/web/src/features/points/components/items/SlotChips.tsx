import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { AccessorySlot } from "../../types";

const SLOTS: AccessorySlot[] = ["head", "face", "body"];

/** 소품을 얹는 부위를 고르는 칩 */
export function SlotChips({
  value,
  onChange,
}: {
  value: AccessorySlot;
  onChange: (slot: AccessorySlot) => void;
}) {
  const { t } = useTranslation("points-items");
  return (
    <div role="group" aria-label={t("slots.label")} className="flex gap-2">
      {SLOTS.map((slot) => (
        <button
          key={slot}
          type="button"
          aria-pressed={value === slot}
          onClick={() => onChange(slot)}
          className={cn(
            "min-h-11 rounded-full border px-3.5 text-sm font-semibold",
            value === slot
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-white text-muted-foreground",
          )}
        >
          {t(`slots.${slot}`)}
        </button>
      ))}
    </div>
  );
}
