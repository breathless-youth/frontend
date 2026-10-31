import { STICKER_URL } from "@/features/timelapse/photoFrame";

/**
 * 소셜룸 얼굴 가리기 설정
 *
 * 켬/끔과 고른 이모지는 서버로 보내지 않고 기기에만 저장한다.
 * 이모지 목록이 바뀌어 저장된 id가 없어지면 첫 번째 이모지로 돌아간다.
 */
export interface FaceMaskEmoji {
  readonly id: string;
  /** 스크린 리더가 읽는 이름 */
  readonly label: string;
  readonly url: string;
}

// ponytail: 3D 이모지 파일이 오기 전까지 기존 스티커 한 장으로 둔다.
// 파일이 오면 public/face-mask/에 두고 이 목록만 바꾼다.
export const FACE_MASK_EMOJIS: readonly FaceMaskEmoji[] = [
  { id: "default", label: "기본 이모지", url: STICKER_URL },
];

const ON_KEY = "focusmakers.socialFaceMask";
const EMOJI_KEY = "focusmakers.socialFaceMaskEmoji";

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

export function readFaceMaskOn(): boolean {
  return read(ON_KEY) !== "off";
}

export function writeFaceMaskOn(on: boolean): void {
  write(ON_KEY, on ? "on" : "off");
}

export function readFaceMaskEmojiId(): string {
  return faceMaskEmojiOf(read(EMOJI_KEY) ?? "").id;
}

export function writeFaceMaskEmojiId(id: string): void {
  write(EMOJI_KEY, faceMaskEmojiOf(id).id);
}
