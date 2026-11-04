/**
 * 얼굴 가리기 설정
 *
 * 켬/끔과 고른 이모지는 서버로 보내지 않고 기기에만 저장한다.
 * 소셜룸은 상대에게 가는 영상을, 싱글룸은 내 화면만 가려서 서로 설정을 나누지 않는다.
 * 이모지 목록이 바뀌어 저장된 id가 없어지면 첫 번째 이모지로 돌아간다.
 */
import i18n from "@/lib/i18n";

export interface FaceMaskEmoji {
  readonly id: string;
  /** 스크린 리더가 읽는 이름 */
  readonly label: string;
  readonly url: string;
}

const FACE_MASK_EMOJI_IDS = [
  "dog",
  "cat",
  "bear",
  "hamster",
  "monkey",
  "panda",
  "rabbit",
  "tiger",
  "frog",
] as const;

// 이미지는 Microsoft Fluent Emoji 3D(MIT)이고, 저작권 고지는 같은 폴더의 LICENSE에 있다.
// 이름은 모듈을 읽는 시점 언어로 굳지 않도록 읽을 때마다 카탈로그에서 가져온다.
export const FACE_MASK_EMOJIS: readonly FaceMaskEmoji[] = FACE_MASK_EMOJI_IDS.map((id) => ({
  id,
  url: `/face-mask/${id}.png`,
  get label() {
    return i18n.t(`live-room:faceMask.emoji.${id}`);
  },
}));

export type FaceMaskScope = "social" | "single";

const KEYS: Record<FaceMaskScope, { readonly on: string; readonly emoji: string }> = {
  social: { on: "focusmakers.socialFaceMask", emoji: "focusmakers.socialFaceMaskEmoji" },
  single: { on: "focusmakers.singleFaceMask", emoji: "focusmakers.singleFaceMaskEmoji" },
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장하지 못하면 다음 입장 때 기본값으로 돌아갈 뿐이다.
  }
}

export function faceMaskEmojiOf(id: string): FaceMaskEmoji {
  return FACE_MASK_EMOJIS.find((emoji) => emoji.id === id) ?? FACE_MASK_EMOJIS[0]!;
}

// 소셜룸은 송신 합성을 오래 켜 두면 보급형 기기가 크게 뜨거워져 원하는 사람만 켜게 한다.
// 싱글룸은 소셜룸과 같은 기본값을 쓴다.
export function readFaceMaskOn(scope: FaceMaskScope): boolean {
  return read(KEYS[scope].on) === "on";
}

export function writeFaceMaskOn(scope: FaceMaskScope, on: boolean): void {
  write(KEYS[scope].on, on ? "on" : "off");
}

export function readFaceMaskEmojiId(scope: FaceMaskScope): string {
  return faceMaskEmojiOf(read(KEYS[scope].emoji) ?? "").id;
}

export function writeFaceMaskEmojiId(scope: FaceMaskScope, id: string): void {
  write(KEYS[scope].emoji, faceMaskEmojiOf(id).id);
}
