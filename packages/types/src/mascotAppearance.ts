/** 효과 그림의 조각 하나이며 위치와 크기는 그림 판에 대한 비율(0~1)이다. 백엔드 Swagger 스키마 `EffectPiece` 기준. */
export interface EffectPieceResponse {
  x: number;
  y: number;
  width: number;
  height: number;
  /** float·fall·rise·twinkle·flutter·pulse 등. 앱이 모르는 값은 멈춘 그림으로 그린다. */
  motion: string;
}

/** 낀 소품 하나이며 백엔드 Swagger 스키마 `EquippedItem` 기준이다. */
export interface EquippedItemResponse {
  itemId: number;
  code: string;
  /** 그림 주소. 아직 없거나 코드로 그리는 빛 효과면 null이다. */
  imageUrl: string | null;
  /** 마스코트 뒤에 그리는 조각의 그림 주소. 이 필드가 생기기 전의 응답에는 없다. */
  backImageUrl?: string | null;
  /** 세트의 움직이는 효과 그림 주소. 이 필드가 생기기 전의 응답에는 없다. */
  effectImageUrl?: string | null;
  /** 효과 칸 소품은 imageUrl에, 세트는 effectImageUrl에 적용한다. */
  effectPieces?: EffectPieceResponse[] | null;
  /** 그림 없이 앱이 코드로 그리는 빛 효과의 종류(aurora·glow·rainbow 등). */
  effectType?: string | null;
}

/**
 * 다른 사람에게 보이는 모습
 *
 * 백엔드 Swagger 스키마 `MascotAppearance`와 그 소품 줄 `EquippedAccessory` 기준이다.
 * 그룹 구성원, 멀티룸 멤버, 랭킹 줄이 같은 모양으로 싣는다.
 * 고른 적이 없거나 비회원이면 첫 마스코트에 accessories가 빈 배열이다.
 */
export interface MascotAppearance {
  mascotCode: string;
  accessories: {
    mascotCode: string;
    /** HEAD·FACE·BODY·WINGS·HELD·UNDERFOOT·EFFECT·SET. SET은 낱개 일곱 칸과 함께 오지 않는다. */
    slot: string;
    item: EquippedItemResponse;
  }[];
}
