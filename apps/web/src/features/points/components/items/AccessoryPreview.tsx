import { useTranslation } from "react-i18next";

import type { MascotId, ShopItem } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 고른 마스코트의 큰 미리 보기
 *
 * 소품을 마스코트 위에 맞춰 얹는 일은 견본 그림이 나온 뒤로 미뤘다.
 * 소품 그림이 없으면 점선 자리 표시만 위에 둔다.
 */
export function AccessoryPreview({
  mascotId,
  item,
}: {
  mascotId: MascotId;
  item: ShopItem | null;
}) {
  const { t } = useTranslation("points-items");
  return (
    <div className="relative flex h-57.5 items-center justify-center">
      <div aria-hidden="true" className="absolute bottom-6 h-6 w-42.5 rounded-full bg-primary/10" />
      <MascotImage id={mascotId} size={180} decorative className="relative" />
      {item !== null &&
        (item.imageUrl === null ? (
          <div className="absolute top-1.5 left-1/2 flex min-h-10 -translate-x-1/2 items-center justify-center rounded-[14px] border-2 border-dashed border-primary bg-white/70 px-2 text-xs font-semibold whitespace-nowrap text-primary">
            {t("preview", { name: item.name })}
          </div>
        ) : (
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute top-1.5 left-1/2 h-16 -translate-x-1/2 object-contain"
          />
        ))}
    </div>
  );
}
