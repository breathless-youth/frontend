/**
 * 마스코트와 소품 칸의 이름
 *
 * 포인트 상점, 프로필, 그룹 책상, 결과 화면이 같은 이름으로 마스코트를 가리키도록 기능 폴더 밖에 둔다.
 */
export type MascotId =
  "book" | "planner" | "pencil" | "stopwatch" | "lamp" | "padlock" | "camcorder";

/** 칸마다 소품 하나를 끼고 일곱 칸을 한꺼번에 낄 수 있다. */
export type AccessorySlot = "face" | "head" | "body" | "wings" | "held" | "underfoot" | "effect";

/** 끼고 있는 소품 한 점이며 그림은 마스코트와 같은 크기의 투명 판이다. */
export type WornAccessory = { slot: AccessorySlot; imageUrl: string };

/** 한 사람이 고른 마스코트와 끼고 있는 소품 */
export type MascotLook = { id: MascotId; accessories: readonly WornAccessory[] };
