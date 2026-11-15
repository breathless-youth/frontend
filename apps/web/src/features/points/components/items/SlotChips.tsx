import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { AccessorySlot } from "../../types";

/**
 * 소품을 얹는 부위를 고르는 칩
 *
 * 상품이 있는 부위만 받아 그리므로 서버가 부위를 늘리면 칩도 따라 늘어난다.
 * 일곱 개가 한 줄에 다 들어가지 않는 폭에서는 옆으로 민다.
 */
export function SlotChips({
  slots,
  value,
  onChange,
}: {
  slots: readonly AccessorySlot[];
  value: AccessorySlot;
  onChange: (slot: AccessorySlot) => void;
}) {
  const { t } = useTranslation("points-items");
  return (
    <div
      role="group"
      aria-label={t("slots.label")}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]"
    >
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          aria-pressed={value === slot}
          onClick={() => onChange(slot)}
          className={cn(
            "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-semibold",
            value === slot
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {t(`slots.${slot}`)}
        </button>
      ))}
    </div>
  );
}
