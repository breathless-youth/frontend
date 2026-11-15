import { useTranslation } from "react-i18next";

import { MascotFigure } from "@/components/mascot/MascotFigure";

import { previewLayers } from "../../model/previewLayers";
import { toWornAccessory } from "../../model/toWornAccessory";
import type { MascotId, ShopItem } from "../../types";

/**
 * 고른 마스코트의 큰 미리 보기
 *
 * 지금 끼고 있는 소품 위에 고른 소품을 그 칸에 바꿔 끼운 모습을 보인다.
 * 그래서 사기 전에도 다른 칸 소품과 어울리는지 볼 수 있다.
 * 고른 소품에 그릴 것이 아직 없으면 그 칸은 비우고 이름표만 위에 둔다.
 */
export function AccessoryPreview({
  mascotId,
  item,
  worn,
}: {
  mascotId: MascotId;
  item: ShopItem | null;
  /** 이 마스코트가 지금 끼고 있는 소품 */
  worn: readonly ShopItem[];
}) {
  const { t } = useTranslation("points-items");
  const accessories = previewLayers(item, worn).flatMap((layer) => {
    const drawn = toWornAccessory(layer);
    return drawn === null ? [] : [drawn];
  });
  return (
    <div className="relative flex h-57.5 items-center justify-center">
      <div aria-hidden="true" className="absolute bottom-6 h-6 w-42.5 rounded-full bg-primary/10" />
      {/* 소품 판이 마스코트 판보다 넓어 몸은 조금 작게 두고 소품이 칸 밖으로 나가지 않게 한다. */}
      <MascotFigure id={mascotId} accessories={accessories} className="relative w-36" />
      {item !== null && toWornAccessory(item) === null && (
        <div className="absolute top-1.5 left-1/2 flex min-h-10 -translate-x-1/2 items-center justify-center rounded-[14px] border-2 border-dashed border-primary bg-white/70 px-2 text-xs font-semibold whitespace-nowrap text-primary">
          {t("preview", { name: item.name })}
        </div>
      )}
    </div>
  );
}
