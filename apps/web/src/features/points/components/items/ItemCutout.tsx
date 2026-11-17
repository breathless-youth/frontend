import { cn } from "@/lib/utils";

import { cutoutFrame, useItemBounds } from "../../model/itemBounds";
import { itemLayers } from "../../model/itemThumbnail";
import type { ShopItem } from "../../types";

/**
 * 소품만 잘라 칸에 크게 그린 그림
 *
 * 소품 그림은 마스코트 판보다 넓은 투명 판이라 그대로 줄이면 소품이 작게 위쪽에 붙는다.
 * 그려진 자리를 측정해 그 자리만 칸의 fill만큼 차게 판을 키워 놓으므로 그림을 새로 만들지 않는다.
 * 측정하는 동안은 숨겨 두고, 측정하지 못하면 판 전체를 칸에 맞춘다.
 * 이름은 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function ItemCutout({
  item,
  fill = 0.8,
  aspect = 1,
  className,
}: {
  item: Pick<ShopItem, "imageUrl" | "backImageUrl" | "effectImageUrl">;
  /** 소품이 칸에서 차지할 비율 */
  fill?: number;
  /** 칸의 가로세로 비율이며 className의 aspect와 같게 준다. */
  aspect?: number;
  className?: string;
}) {
  const layers = itemLayers(item);
  const bounds = useItemBounds(layers);
  return (
    <span aria-hidden="true" className={cn("relative block overflow-hidden", className)}>
      {/* 측정하는 동안은 판 전체 자리에 숨겨 두어 그림을 함께 받고, 측정이 끝나면 소품 자리로 옮겨 보인다. */}
      {/* 흰 구름이나 눈송이처럼 옅은 소품도 칸 바탕에서 보이게 아주 옅은 그림자를 둔다. */}
      <span
        className="absolute drop-shadow-sm"
        style={{
          ...cutoutFrame(bounds ?? null, fill, aspect),
          ...(bounds === undefined ? { opacity: 0 } : null),
        }}
      >
        {layers.map((url) => (
          <img
            key={url}
            src={url}
            alt=""
            draggable={false}
            // 전역 img의 max-width: 100%가 키운 판을 칸 폭으로 줄이지 않게 푼다.
            className="absolute inset-0 size-full max-w-none"
          />
        ))}
      </span>
    </span>
  );
}
