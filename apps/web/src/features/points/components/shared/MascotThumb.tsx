import type { ReactNode } from "react";

import { MascotFigure } from "@/components/mascot/MascotFigure";
import { MASCOT_INSET_IN_BOARD } from "@/components/mascot/mascotLayers";
import type { WornAccessory } from "@/components/mascot/types";
import { cn } from "@/lib/utils";

import type { MascotId } from "../../types";

const IN_BOARD = { inset: MASCOT_INSET_IN_BOARD };

/**
 * 소품 판까지 상자 안에 담아 줄여 그린 마스코트
 *
 * 소품 그림은 마스코트 판보다 사방으로 넓어서 작은 칸에 마스코트를 꽉 채우면 소품이 칸 밖으로 나간다.
 * 상자를 소품 판 크기로 보고 마스코트를 판 안쪽 자리에 두어 어떤 소품을 껴도 상자를 넘지 않게 한다.
 * 잠긴 마스코트는 소품 없이 흐린 흑백으로 같은 자리에 그려서 칸마다 몸 크기가 같다.
 * 자물쇠처럼 몸에 붙는 표시는 badge로 넘기면 몸 상자를 기준으로 놓인다.
 * 이름은 옆 글자가 알려 주므로 그림은 화면 낭독기에서 뺀다.
 */
export function MascotThumb({
  id,
  accessories = [],
  locked = false,
  badge,
  className,
}: {
  id: MascotId;
  accessories?: readonly WornAccessory[];
  locked?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("relative block aspect-square shrink-0", className)}>
      <span data-mascot-in-board="" className="absolute" style={IN_BOARD}>
        <MascotFigure
          id={id}
          accessories={locked ? [] : accessories}
          className={cn("size-full", locked && "opacity-30 grayscale")}
        />
        {badge}
      </span>
    </span>
  );
}
