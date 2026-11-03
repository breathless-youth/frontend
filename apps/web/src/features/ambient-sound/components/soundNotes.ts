import i18n from "@/lib/i18n";

import type { SoundId } from "../catalog";

/**
 * 소리 이름 옆 안내 아이콘에 붙는 툴팁 문구.
 */
const NOTES: Partial<Record<SoundId, "binaural">> = {
  binaural: "binaural",
};

export function soundNote(id: SoundId): string | undefined {
  const note = NOTES[id];
  return note === undefined ? undefined : i18n.t(`ambient-sound:notes.${note}`);
}
