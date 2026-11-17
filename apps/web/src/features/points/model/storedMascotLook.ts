import { MASCOT_SRC } from "@/components/mascot/mascotSources";
import type {
  AccessorySlot,
  EffectPiece,
  EffectSprite,
  MascotId,
  MascotLook,
  WornAccessory,
} from "@/components/mascot/types";

/**
 * 마지막으로 받은 내 마스코트 모습의 기기 저장
 *
 * 앱은 세션마다 새 웹뷰를 열어 조회 캐시가 비어 있다.
 * 그래서 결과 화면과 프로필이 처음 그릴 때 쓰도록 마지막으로 받은 모습을 사용자 번호와 함께 한 칸에 둔다.
 * 다른 사용자가 남긴 값은 읽지 않는다.
 * 웹뷰끼리 같은 출처의 localStorage를 함께 써서 상점이 있는 탭 웹뷰가 바꾼 값을 세션 웹뷰가 읽는다.
 * 저장소를 쓸 수 없는 기기(사생활 보호 모드, 용량 초과)에서는 아무것도 남기지 않고 서버 값만 쓴다.
 */
const STORAGE_KEY = "focusmakers:my-mascot-look.v1";

type Stored = { userId: number; look: MascotLook | null };

/** 받은 모습을 사용자 번호와 함께 남긴다. 고른 마스코트가 없다는 답(null)도 그대로 남긴다. */
export function rememberMascotLook(userId: number, look: MascotLook | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, look } satisfies Stored));
  } catch {
    // 남기지 못하면 다음 웹뷰가 서버 답을 기다릴 뿐이다.
  }
}

/**
 * 이 사용자가 마지막으로 받은 모습
 *
 * 남긴 값이 없거나, 다른 사용자의 값이거나, 읽을 수 없는 모양이면 undefined다.
 * null은 고른 마스코트가 없다고 서버가 답했던 경우다.
 */
export function recallMascotLook(userId: number): MascotLook | null | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.userId !== userId) {
    return undefined;
  }
  return parsed.look === null ? null : (toLook(parsed.look) ?? undefined);
}

/** 바뀐 모습을 받지 못했을 때 지난 모습을 다음 웹뷰가 그리지 않게 지운다. */
export function forgetMascotLook(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 지우지 못해도 다음 웹뷰가 받은 서버 값으로 바로 덮는다.
  }
}

// 저장값은 다른 버전의 웹이 남겼을 수 있는 외부 입력이라 화면이 아는 모양만 받는다.
const SLOTS = {
  face: true,
  head: true,
  body: true,
  wings: true,
  held: true,
  underfoot: true,
  effect: true,
  set: true,
} satisfies Record<AccessorySlot, true>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMascotId(value: unknown): value is MascotId {
  return typeof value === "string" && Object.hasOwn(MASCOT_SRC, value);
}

function isSlot(value: unknown): value is AccessorySlot {
  return typeof value === "string" && Object.hasOwn(SLOTS, value);
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

function toLook(value: unknown): MascotLook | null {
  return isRecord(value) &&
    isMascotId(value.id) &&
    Array.isArray(value.accessories) &&
    value.accessories.every(isAccessory)
    ? (value as MascotLook)
    : null;
}

function isAccessory(value: unknown): value is WornAccessory {
  if (!isRecord(value) || !isSlot(value.slot)) {
    return false;
  }
  const { imageUrl, backImageUrl, effectImageUrl, effectType, effectPieces } = value;
  return (
    [imageUrl, backImageUrl, effectImageUrl, effectType].every(isOptionalString) &&
    (effectPieces === undefined || (Array.isArray(effectPieces) && effectPieces.every(isPiece)))
  );
}

function isPiece(value: unknown): value is EffectPiece {
  return (
    isRecord(value) &&
    [value.x, value.y, value.width, value.height].every(isNumber) &&
    typeof value.motion === "string" &&
    (value.sprite === undefined || isSprite(value.sprite))
  );
}

function isSprite(value: unknown): value is EffectSprite {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    isNumber(value.frames) &&
    isNumber(value.durationMs)
  );
}
