import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { splitAccessoryLayers } from "./mascotLayers";
import { MASCOT_SRC } from "./mascotSources";
import type { MascotId, WornAccessory } from "./types";

const LAYER = "absolute inset-0 size-full object-contain";

function AccessoryLayer({ accessory }: { accessory: WornAccessory }) {
  return (
    <img
      src={accessory.imageUrl}
      alt=""
      draggable={false}
      data-slot={`accessory-${accessory.slot}`}
      className={LAYER}
    />
  );
}

/**
 * 고른 마스코트와 끼고 있는 소품을 겹쳐 그린 그림
 *
 * 소품 그림이 마스코트와 같은 크기의 투명 판이라 위치를 계산하지 않고 같은 상자에 겹친다.
 * 상자는 정사각형이고 크기와 자리는 쓰는 화면이 className으로 정한다.
 * 표정이 바뀌는 그림처럼 몸을 다르게 그리는 화면은 body로 몸 자리를 채운다.
 * 이름이나 상태는 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function MascotFigure({
  id,
  accessories = [],
  body,
  className,
}: {
  id: MascotId;
  accessories?: readonly WornAccessory[];
  /** 기본 정지 그림 대신 몸 자리에 그릴 조각이며 소품과 같은 상자를 채워야 소품이 맞는다. */
  body?: ReactNode;
  className?: string;
}) {
  const { behind, front } = splitAccessoryLayers(accessories);
  return (
    <span aria-hidden="true" className={cn("relative block aspect-square shrink-0", className)}>
      {behind.map((accessory) => (
        <AccessoryLayer key={accessory.slot} accessory={accessory} />
      ))}
      <span data-slot="mascot-body" className="absolute inset-0">
        {body ?? <img src={MASCOT_SRC[id]} alt="" draggable={false} className={LAYER} />}
      </span>
      {front.map((accessory) => (
        <AccessoryLayer key={accessory.slot} accessory={accessory} />
      ))}
    </span>
  );
}
