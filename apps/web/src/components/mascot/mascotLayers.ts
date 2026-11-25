import { BACK_LIGHT_MOTIONS, ORBIT_MOTION } from "./drawnMotion";
import type { AccessorySlot, EffectPiece, WornAccessory } from "./types";

/**
 * 소품이 겹치는 순서
 *
 * 뒤에서 앞으로 효과 뒤 그림, 효과 앞 그림, 날개, 발밑, 나머지 칸의 뒤 조각, 마스코트 몸, 몸 소품, 날개 앞 조각, 발밑 앞 조각, 얼굴, 머리, 물건, 효과 궤도의 앞쪽 반 순서다.
 * 효과는 몸과 등 뒤 소품을 가리지 않게 앞 그림까지 모두 가장 뒤에 그린다.
 * 몸 둘레를 도는 궤도 조각만 예외로, 같은 조각을 가장 앞에 한 번 더 그려 궤도 앞쪽 반은 몸과 소품 앞을, 뒤쪽 반은 몸 뒤를 지나게 한다.
 * 발밑은 바닥에 놓인 소품이라 망토 자락이나 날개 끝이 덮지 않게 몸 뒤에서도 앞 조각에서도 날개보다 앞에 그린다.
 * 날개와 발밑은 본체가 몸 뒤에 있는 칸이라 그림이 한 장이면 그 그림을 몸 뒤에 그린다.
 * 이 두 칸에 뒤 그림이 따로 오면 뒤 그림이 본체이고, 앞 그림은 끈이나 앞발처럼 몸 앞으로 넘어오는 조각이다.
 * 나머지 칸은 앞 그림이 본체이고, 목도리처럼 몸을 감싸는 소품만 뒤로 돌아가는 조각을 따로 받아 몸 뒤에 그린다.
 * 효과 칸은 오라나 뒤 배경처럼 뒤 그림만 오기도 하며, 그때는 뒤 그림이 앞 그림과 같은 방식으로 움직인다.
 * 세트를 입었으면 낱개 소품은 그리지 않고 뒤에서 앞으로 세트의 효과, 뒤 조각, 몸, 옷, 효과 궤도의 앞쪽 반만 그린다.
 */
const BEHIND: readonly AccessorySlot[] = ["wings", "underfoot"];
const FRONT: readonly AccessorySlot[] = ["body", "wings", "underfoot", "face", "head", "held"];

/**
 * 소품 그림 판이 마스코트 판보다 넓은 정도
 *
 * 마스코트 판 한 변이 1024일 때 소품 판은 사방으로 208씩 넓은 1440이다.
 * 돗자리나 우산처럼 몸 밖으로 나가는 소품이 잘리지 않게 한 규격이라 그림을 만드는 쪽과 같은 값을 써야 한다.
 */
export const ACCESSORY_BOARD_OUTSET = `${(-208 / 1024) * 100}%`;

/**
 * 소품 판 크기 상자 안에서 마스코트 판이 놓이는 안쪽 여백
 *
 * 작은 칸이 소품까지 칸 안에 담으려고 칸을 소품 판으로 보고 마스코트를 이만큼 안쪽에 둘 때 쓴다.
 * 위 규격과 같은 숫자라 한쪽만 바꾸지 않는다.
 */
export const MASCOT_INSET_IN_BOARD = `${Number(((208 / 1440) * 100).toFixed(4))}%`;

/** 코드로 그릴 줄 아는 빛 효과 */
const GLOW_TYPES = ["aurora", "glow", "rainbow"] as const;
export type GlowType = (typeof GLOW_TYPES)[number];

export type AccessoryLayerImage = {
  key: string;
  slot: AccessorySlot;
  imageUrl: string;
  /** 있으면 그림을 통째로 그리지 않고 조각마다 잘라 움직인다. */
  pieces?: readonly EffectPiece[];
  /** 조각 정보가 없는 효과 그림이라 통째로 천천히 떠오르내린다. */
  floats?: true;
  /** 몸 앞에 한 번 더 그린 궤도 조각이라 궤도 앞쪽 반에서만 보인다. */
  orbitFront?: true;
};

function pick(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return order.flatMap((slot) => {
    // 한 칸에는 하나만 끼므로 같은 칸이 또 와도 먼저 온 것만 그린다.
    const worn = accessories.find((accessory) => accessory.slot === slot);
    return worn === undefined ? [] : [worn];
  });
}

/** 효과 그림이 움직이는 방식이며 조각 정보가 있으면 조각마다, 없으면 통째로 움직인다. */
function effectMotion(pieces: readonly EffectPiece[] | undefined) {
  return pieces ? { pieces } : { floats: true as const };
}

/**
 * 몸 뒤에 놓이는 그림 가운데 효과를 뺀 것
 *
 * 발밑과 날개는 뒤 그림이 없으면 앞 그림이 본체라 그 그림을 몸 뒤에 둔다.
 * 나머지 칸은 뒤 그림이 있을 때만 그 뒤 그림을 둔다.
 * 효과는 `effectImages`가 이보다 뒤에 따로 둔다.
 */
function behindPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] => {
    if (worn.backImageUrl !== undefined) {
      return [{ key: `${worn.slot}-back`, slot: worn.slot, imageUrl: worn.backImageUrl }];
    }
    return BEHIND.includes(worn.slot) && worn.imageUrl !== undefined
      ? [{ key: worn.slot, slot: worn.slot, imageUrl: worn.imageUrl }]
      : [];
  });
}

const isBackLight = (piece: EffectPiece) => BACK_LIGHT_MOTIONS.includes(piece.motion);

/**
 * 효과 칸의 그림
 *
 * 몸 뒤의 가장 뒤에 뒤 그림, 앞 그림 순서로 둔다.
 * 앞 그림이 없으면 조각이 모두 뒤 그림을 잘라 움직인다.
 * 앞 그림이 있으면 조각은 앞 그림을 자르고, 몸을 감싼 빛을 움직이는 조각만 뒤 그림을 자른다.
 * 그래서 연보라 오라처럼 반짝이(앞 그림)와 빛(뒤 그림)이 함께 오는 효과도 둘을 따로 움직인다.
 */
function effectImages(effect: WornAccessory | undefined): AccessoryLayerImage[] {
  if (effect === undefined) {
    return [];
  }
  const { backImageUrl, imageUrl, effectPieces } = effect;
  const backLight = effectPieces?.filter(isBackLight) ?? [];
  const frontMotion = effectPieces?.filter((piece) => !isBackLight(piece));
  return [
    ...(backImageUrl === undefined
      ? []
      : [
          {
            key: "effect-back",
            slot: "effect" as const,
            imageUrl: backImageUrl,
            ...(imageUrl === undefined
              ? effectMotion(effectPieces)
              : backLight.length > 0
                ? { pieces: backLight }
                : null),
          },
        ]),
    ...(imageUrl === undefined
      ? []
      : [
          {
            key: "effect",
            slot: "effect" as const,
            imageUrl,
            ...effectMotion(frontMotion?.length ? frontMotion : undefined),
          },
        ]),
  ];
}

/**
 * 몸 앞에 한 번 더 그릴 궤도 조각
 *
 * 몸 뒤 그림에서 궤도 조각만 골라 같은 그림을 몸 앞에도 둔다.
 * 두 층의 조각은 같은 박자로 돌고, 몸 뒤 층은 궤도 뒤쪽 반에서만, 몸 앞 층은 앞쪽 반에서만 보인다.
 */
function orbitFront(layers: readonly AccessoryLayerImage[]): AccessoryLayerImage[] {
  return layers.flatMap((layer): AccessoryLayerImage[] => {
    const orbit = layer.pieces?.filter((piece) => piece.motion === ORBIT_MOTION) ?? [];
    return orbit.length === 0
      ? []
      : [
          {
            key: `${layer.key}-front`,
            slot: layer.slot,
            imageUrl: layer.imageUrl,
            pieces: orbit,
            orbitFront: true,
          },
        ];
  });
}

/** 몸 앞에 놓이는 그림이며 발밑과 날개의 앞 그림은 뒤 그림이 따로 온 소품의 앞 조각일 때만 여기에 놓인다. */
function frontPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] =>
    worn.imageUrl === undefined || (BEHIND.includes(worn.slot) && worn.backImageUrl === undefined)
      ? []
      : [{ key: worn.slot, slot: worn.slot, imageUrl: worn.imageUrl }],
  );
}

/** 세트의 효과 그림도 낱개 효과처럼 몸을 가리지 않게 세트 뒤 조각보다 뒤에 둔다. */
function setLayers(set: WornAccessory) {
  const effect: AccessoryLayerImage[] =
    set.effectImageUrl === undefined
      ? []
      : [
          {
            key: "set-effect",
            slot: "set",
            imageUrl: set.effectImageUrl,
            ...effectMotion(set.effectPieces),
          },
        ];
  return {
    behind: [...effect, ...behindPieces([set], ["set"])],
    front: [...frontPieces([set], ["set"]), ...orbitFront(effect)],
  };
}

export function splitAccessoryLayers(accessories: readonly WornAccessory[]): {
  behind: AccessoryLayerImage[];
  front: AccessoryLayerImage[];
  /** 몸 뒤에 코드로 그릴 빛 효과이며 없거나 모르는 종류면 null이다. */
  glow: GlowType | null;
  wearsSet: boolean;
} {
  const set = accessories.find((accessory) => accessory.slot === "set");
  if (set !== undefined) {
    return { ...setLayers(set), glow: null, wearsSet: true };
  }
  const effect = accessories.find((accessory) => accessory.slot === "effect");
  const effectLayers = effectImages(effect);
  return {
    behind: [
      ...effectLayers,
      ...behindPieces(accessories, [...BEHIND, "body", "face", "head", "held"]),
    ],
    front: [...frontPieces(accessories, FRONT), ...orbitFront(effectLayers)],
    glow: GLOW_TYPES.find((type) => type === effect?.effectType) ?? null,
    wearsSet: false,
  };
}
