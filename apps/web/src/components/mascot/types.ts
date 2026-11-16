/**
 * 마스코트와 소품 칸의 이름
 *
 * 포인트 상점, 프로필, 그룹 책상, 결과 화면이 같은 이름으로 마스코트를 가리키도록 기능 폴더 밖에 둔다.
 */
export type MascotId =
  "book" | "planner" | "pencil" | "stopwatch" | "lamp" | "padlock" | "camcorder";

/**
 * 소품을 끼는 칸
 *
 * 낱개 일곱 칸은 칸마다 하나씩 한꺼번에 낄 수 있다.
 * 세트는 한 벌 옷이라 낱개 일곱 칸과 함께 끼지 않는다.
 */
export type AccessorySlot =
  "face" | "head" | "body" | "wings" | "held" | "underfoot" | "effect" | "set";

/** 효과 그림의 조각 하나이며 위치와 크기는 그림 판에 대한 비율이다. */
export type EffectPiece = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 서버가 정한 움직임 이름이며 모르는 이름은 멈춘 그림으로 그린다. */
  motion: string;
};

/** 끼고 있는 소품 한 점이며 그림은 마스코트 판보다 사방으로 넓은 투명 판이다. */
export type WornAccessory = {
  slot: AccessorySlot;
  /** 코드로 그리는 빛 효과와 뒤 그림만 있는 효과는 앞 그림이 없다. */
  imageUrl?: string;
  /** 몸 뒤에 그리는 그림이며 발밑과 날개는 본체, 그 밖의 칸은 몸 뒤로 돌아가는 조각이다. */
  backImageUrl?: string;
  /** 세트에서 옷과 따로 움직이는 효과 그림 */
  effectImageUrl?: string;
  /** 효과 칸 소품은 imageUrl을, 앞 그림이 없으면 backImageUrl을, 세트는 effectImageUrl을 이 조각대로 잘라 움직인다. */
  effectPieces?: readonly EffectPiece[];
  /** 그림 없이 코드로 그리는 빛 효과의 종류 */
  effectType?: string;
};

/** 한 사람이 고른 마스코트와 끼고 있는 소품 */
export type MascotLook = { id: MascotId; accessories: readonly WornAccessory[] };
