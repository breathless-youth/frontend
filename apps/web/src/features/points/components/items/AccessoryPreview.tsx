import { useTranslation } from "react-i18next";

import { MASCOT_FOOT_Y } from "@/components/mascot/mascotExpressions";
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
 * 발 바로 아래에는 공부 완료 화면과 같은 흐린 그림자를 둔다.
 * 발밑 소품을 끼면 그 소품이 바닥 노릇을 해서 그림자를 그리지 않는다.
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
  const grounded = accessories.some((accessory) => accessory.slot === "underfoot");
  return (
    <div className="relative flex h-57.5 items-center justify-center">
      {/* 소품 판이 마스코트 판보다 넓어 몸은 조금 작게 두고 소품이 칸 밖으로 나가지 않게 한다. */}
      <span className="relative block w-36">
        {!grounded && (
          // 발 높이가 마스코트마다 달라 그림자 자리를 발끝 표에서 읽는다.
          <span
            aria-hidden="true"
            data-slot="preview-shadow"
            className="absolute left-1/2 h-3.5 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--result-mascot-shadow) blur-xs"
            style={{ top: `${Number((MASCOT_FOOT_Y[mascotId] * 100).toFixed(2))}%` }}
          />
        )}
        <MascotFigure id={mascotId} accessories={accessories} className="relative w-full" />
      </span>
      {item !== null && toWornAccessory(item) === null && (
        <div className="absolute top-1.5 left-1/2 flex min-h-10 -translate-x-1/2 items-center justify-center rounded-[14px] border-2 border-dashed border-primary bg-muted/70 px-2 text-xs font-semibold whitespace-nowrap text-primary">
          {t("preview", { name: item.name })}
        </div>
      )}
    </div>
  );
}
