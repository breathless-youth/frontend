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

// 이미지는 Microsoft Fluent Emoji 3D(MIT)이고, 저작권 고지는 같은 폴더의 LICENSE에 있다.
export const FACE_MASK_EMOJIS: readonly FaceMaskEmoji[] = [
  { id: "dog", label: "개", url: "/face-mask/dog.png" },
  { id: "cat", label: "고양이", url: "/face-mask/cat.png" },
  { id: "bear", label: "곰", url: "/face-mask/bear.png" },
  { id: "hamster", label: "햄스터", url: "/face-mask/hamster.png" },
  { id: "monkey", label: "원숭이", url: "/face-mask/monkey.png" },
  { id: "panda", label: "판다", url: "/face-mask/panda.png" },
  { id: "rabbit", label: "토끼", url: "/face-mask/rabbit.png" },
  { id: "tiger", label: "호랑이", url: "/face-mask/tiger.png" },
  { id: "frog", label: "개구리", url: "/face-mask/frog.png" },
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
