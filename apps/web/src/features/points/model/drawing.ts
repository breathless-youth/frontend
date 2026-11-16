import type { EffectPiece, WornAccessory } from "@/components/mascot/types";

/** 서버 응답과 상점 상품이 함께 가진 그림 필드 */
type DrawingFields = {
  imageUrl: string | null;
  backImageUrl?: string | null;
  effectImageUrl?: string | null;
  effectPieces?: readonly EffectPiece[] | null;
  effectType?: string | null;
};

/**
 * 그릴 것이 있는 상품인지
 *
 * 오라나 뒤 배경 같은 효과는 뒤 그림만 오므로 앞 그림이 없다고 버리지 않는다.
 * 빛 효과 종류는 빈 문자열도 없는 것으로 본다.
 */
export function hasDrawing(fields: DrawingFields): boolean {
  return fields.imageUrl !== null || Boolean(fields.backImageUrl) || Boolean(fields.effectType);
}

/**
 * 앞 그림을 뺀 그림 필드 가운데 값이 있는 것
 *
 * 없는 값은 열쇠째 빼서 받는 쪽이 있는 것만 보게 한다.
 */
export function drawingExtras(fields: DrawingFields): Omit<WornAccessory, "slot" | "imageUrl"> {
  return {
    ...(fields.backImageUrl ? { backImageUrl: fields.backImageUrl } : null),
    ...(fields.effectImageUrl ? { effectImageUrl: fields.effectImageUrl } : null),
    ...(fields.effectPieces ? { effectPieces: fields.effectPieces } : null),
    ...(fields.effectType ? { effectType: fields.effectType } : null),
  };
}
