import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { cn } from "@/lib/utils";

import type { AccessorySlot } from "../../types";

/**
 * 소품을 끼울 부위를 고르는 칩
 *
 * 상품이 있는 부위만 받아 그리므로 서버가 부위를 늘리면 칩도 따라 늘어난다.
 * 일곱 개가 한 줄에 다 들어가지 않는 폭에서는 옆으로 민다.
 * 처음 그릴 때와 고른 칩이 바뀔 때 고른 칩이 줄 밖에 있으면 보이는 자리까지 칩 줄을 민다.
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
  const groupRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    // 처음 그릴 때는 이미 그 자리에 있던 것처럼 바로 옮기고, 고른 칩이 바뀔 때만 부드럽게 민다.
    const first = !mountedRef.current;
    mountedRef.current = true;
    const group = groupRef.current;
    const chip = group?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!group || !chip) {
      return;
    }
    // scrollIntoView는 페이지 세로 스크롤까지 움직여서 칩 줄의 가로 위치만 계산해 민다.
    const pad = Number.parseFloat(getComputedStyle(group).paddingLeft) || 0;
    const start =
      chip.getBoundingClientRect().left - group.getBoundingClientRect().left + group.scrollLeft;
    const end = start + chip.getBoundingClientRect().width;
    const left =
      start - pad < group.scrollLeft
        ? start - pad
        : end + pad > group.scrollLeft + group.clientWidth
          ? end + pad - group.clientWidth
          : group.scrollLeft;
    if (left !== group.scrollLeft) {
      group.scrollTo({ left, behavior: first || prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [value]);
  return (
    <div
      ref={groupRef}
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
