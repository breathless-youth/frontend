import { useTranslation } from "react-i18next";

import type { WornAccessory } from "@/components/mascot/types";
import { cn } from "@/lib/utils";

import type { Mascot, MascotId } from "../../types";
import { MascotThumb } from "../shared/MascotThumb";

/**
 * 오늘 함께할 마스코트 고르기
 *
 * 마스코트를 다 모은 뒤 다음 마스코트 카드 자리에 놓인다.
 * 마스코트마다 꾸며 둔 소품을 입혀 그려서 고르기 전에 어떤 모습인지 보인다.
 * 저장과 다시 받기는 라우트가 맡고, 선택 표시는 다시 받은 상점 데이터로 바뀐다.
 */
export function MascotPickerCard({
  mascots,
  worn,
  onSelect,
}: {
  mascots: Mascot[];
  /** 마스코트마다 끼고 있는 소품이며 없는 마스코트는 소품 없이 그린다. */
  worn: ReadonlyMap<MascotId, readonly WornAccessory[]>;
  onSelect: (id: MascotId) => void;
}) {
  const { t } = useTranslation(["points-shop", "points"]);
  return (
    <section
      aria-label={t("points-shop:picker.label")}
      className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-3 shadow-sb-card"
    >
      <h2 className="text-[15px] font-bold">{t("points-shop:picker.title")}</h2>
      <div className="flex justify-between">
        {mascots.map((mascot) => (
          <button
            key={mascot.id}
            type="button"
            aria-pressed={mascot.selected}
            aria-label={t(`points:mascots.${mascot.id}`)}
            onClick={() => onSelect(mascot.id)}
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl",
              mascot.selected && "bg-brand-subtle ring-2 ring-primary",
            )}
          >
            <MascotThumb id={mascot.id} accessories={worn.get(mascot.id)} className="size-11" />
          </button>
        ))}
      </div>
    </section>
  );
}
