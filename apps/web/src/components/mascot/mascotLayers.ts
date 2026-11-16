import type { AccessorySlot, EffectPiece, WornAccessory } from "./types";

/**
 * 소품이 겹치는 순서
 *
 * 뒤에서 앞으로 효과 뒤 그림, 발밑, 날개, 나머지 칸의 뒤 조각, 마스코트 몸, 몸 소품, 날개 앞 조각, 발밑 앞 조각, 얼굴, 머리, 물건, 효과 순서다.
 * 발밑과 날개는 본체가 몸 뒤에 있는 칸이라 그림이 한 장이면 그 그림을 몸 뒤에 그린다.
 * 이 두 칸에 뒤 그림이 따로 오면 뒤 그림이 본체이고, 앞 그림은 끈이나 앞발처럼 몸 앞으로 넘어오는 조각이다.
 * 나머지 칸은 앞 그림이 본체이고, 목도리처럼 몸을 감싸는 소품만 뒤로 돌아가는 조각을 따로 받아 몸 뒤에 그린다.
 * 효과 칸은 오라나 뒤 배경처럼 뒤 그림만 오기도 하며, 그때는 뒤 그림이 앞 효과와 같은 방식으로 움직인다.
 * 세트를 입었으면 낱개 소품은 그리지 않고 세트의 뒤 조각, 몸, 옷, 효과만 그린다.
 */
const BEHIND: readonly AccessorySlot[] = ["underfoot", "wings"];
const FRONT: readonly AccessorySlot[] = [
  "body",
  "wings",
  "underfoot",
  "face",
  "head",
  "held",
  "effect",
];

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
  /** 조각 정보가 없는 효과 그림이라 통째로 천천히 떠오르내린다. */
  floats?: true;
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
 * 몸 뒤에 놓이는 그림
 *
 * 발밑과 날개는 뒤 그림이 없으면 앞 그림이 본체라 그 그림을 몸 뒤에 둔다.
 * 효과는 앞 그림이 없을 때만 뒤 그림이 움직이고, 앞 그림이 있으면 움직임은 앞 그림이 맡는다.
 */
function behindPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] => {
    if (worn.backImageUrl !== undefined) {
      const moves = worn.slot === "effect" && worn.imageUrl === undefined;
      return [
        {
          key: `${worn.slot}-back`,
          slot: worn.slot,
          imageUrl: worn.backImageUrl,
          ...(moves ? effectMotion(worn.effectPieces) : null),
        },
      ];
    }
    return BEHIND.includes(worn.slot) && worn.imageUrl !== undefined
      ? [{ key: worn.slot, slot: worn.slot, imageUrl: worn.imageUrl }]
      : [];
  });
}

/** 몸 앞에 놓이는 그림이며 발밑과 날개의 앞 그림은 뒤 그림이 따로 온 소품의 앞 조각일 때만 여기에 놓인다. */
function frontPieces(accessories: readonly WornAccessory[], order: readonly AccessorySlot[]) {
  return pick(accessories, order).flatMap((worn): AccessoryLayerImage[] =>
    worn.imageUrl === undefined || (BEHIND.includes(worn.slot) && worn.backImageUrl === undefined)
      ? []
      : [
          {
            key: worn.slot,
            slot: worn.slot,
            imageUrl: worn.imageUrl,
            ...(worn.slot === "effect" ? effectMotion(worn.effectPieces) : null),
          },
        ],
  );
}

function setLayers(set: WornAccessory) {
  return {
    behind: behindPieces([set], ["set"]),
    front: [
      ...frontPieces([set], ["set"]),
      ...(set.effectImageUrl === undefined
        ? []
        : [
            {
              key: "set-effect",
              slot: "set" as const,
              imageUrl: set.effectImageUrl,
              ...effectMotion(set.effectPieces),
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
    behind: behindPieces(accessories, ["effect", ...BEHIND, "body", "face", "head", "held"]),
    front: frontPieces(accessories, FRONT),
    glow: GLOW_TYPES.find((type) => type === effectType) ?? null,
    wearsSet: false,
  };
}
