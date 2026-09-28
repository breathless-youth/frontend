import type { SoundId } from "../catalog";

/**
 * 소리 이름 옆 안내 아이콘에 붙는 툴팁 문구.
 */
const NOTES: Record<SoundId, string> = {
  binaural: "이어폰을 껴야 제대로 들려요",
};

export function soundNote(id: SoundId): string | undefined {
  return NOTES[id];
}
