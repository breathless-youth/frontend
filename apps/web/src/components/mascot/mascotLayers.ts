import type { AccessorySlot, EffectPiece, WornAccessory } from "./types";

/**
 * 소품이 겹치는 순서
 *
 * 뒤에서 앞으로 효과 뒤 조각, 발밑, 날개, 나머지 칸의 뒤 조각, 마스코트 몸, 몸 소품, 얼굴, 머리, 물건, 효과 순서다.
 * 목도리처럼 몸을 감싸는 소품은 뒤로 돌아가는 조각을 따로 받아 몸 뒤에 그린다.
 * 세트를 입었으면 낱개 소품은 그리지 않고 세트의 뒤 조각, 몸, 옷, 효과만 그린다.
 */
const BEHIND: readonly AccessorySlot[] = ["underfoot", "wings"];
const FRONT: readonly AccessorySlot[] = ["body", "face", "head", "held", "effect"];

/**
 * 소품 그림 판이 마스코트 판보다 넓은 정도
 *
 * 마스코트 판 한 변이 1024일 때 소품 판은 사방으로 208씩 넓은 1440이다.
 * 돗자리나 우산처럼 몸 밖으로 나가는 소품이 잘리지 않게 한 규격이라 그림을 만드는 쪽과 같은 값을 써야 한다.
 */
export const ACCESSORY_BOARD_OUTSET = `${(-208 / 1024) * 100}%`;

/** 세트 그림이 마스코트까지 그린 완성 그림으로 바뀌면 true로 바꿔 몸을 그리지 않는다. */
export const HIDE_MASCOT_UNDER_SET = false;

/** 코드로 그릴 줄 아는 빛 효과 */
const GLOW_TYPES = ["aurora", "glow", "rainbow"] as const;
export type GlowType = (typeof GLOW_TYPES)[number];

export type AccessoryLayerImage = {
  key: string;
  slot: AccessorySlot;
  imageUrl: string;
  /** 있으면 그림을 통째로 그리지 않고 조각마다 잘라 움직인다. */
  pieces?: readonly EffectPiece[];
};

function pick(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return order.flatMap((slot) => {
    // 한 칸에는 하나만 끼므로 같은 칸이 또 와도 먼저 온 것만 그린다.
    const worn = accessories.find((accessory) => accessory.slot === slot);
    return worn === undefined ? [] : [worn];
  });
}

function backPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] =>
    worn.backImageUrl === undefined
      ? []
      : [{ key: `${worn.slot}-back`, slot: worn.slot, imageUrl: worn.backImageUrl }],
  );
}

function frontPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] =>
    worn.imageUrl === undefined
      ? []
      : [
          {
            key: worn.slot,
            slot: worn.slot,
            imageUrl: worn.imageUrl,
            // 조각 정보는 효과 칸 그림에만 쓴다.
            ...(worn.slot === "effect" && worn.effectPieces ? { pieces: worn.effectPieces } : null),
          },
        ],
  );
}

function setLayers(set: WornAccessory) {
  return {
    behind: backPieces([set], ["set"]),
    front: [
      ...frontPieces([set], ["set"]),
      ...(set.effectImageUrl === undefined
        ? []
        : [
            {
              key: "set-effect",
              slot: "set" as const,
              imageUrl: set.effectImageUrl,
              ...(set.effectPieces ? { pieces: set.effectPieces } : null),
            },
          ]),
    ],
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
  const effectType = accessories.find((accessory) => accessory.slot === "effect")?.effectType;
  return {
    behind: [
      ...backPieces(accessories, ["effect"]),
      ...frontPieces(accessories, BEHIND),
      ...backPieces(accessories, BEHIND),
      ...backPieces(accessories, ["body", "face", "head", "held"]),
    ],
    front: frontPieces(accessories, FRONT),
    glow: GLOW_TYPES.find((type) => type === effectType) ?? null,
    wearsSet: false,
  };
}
