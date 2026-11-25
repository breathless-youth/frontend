import i18n from "@/lib/i18n";

import { soundGroupOf } from "../catalog";
import type { AmbientSound, SoundGroupId } from "../catalog";

export type { SoundGroupId };

export type SoundGroup = {
  readonly id: SoundGroupId;
  readonly label: string;
  readonly sounds: readonly AmbientSound[];
};

const ORDER: readonly SoundGroupId[] = ["music", "ambience", "noise"];

/** `keepAmbience`면 소리 목록을 못 받아도 `배경 소리` 탭을 남긴다. 감독관 발소리 줄이 그 탭에 있다. */
export function soundGroups(catalog: readonly AmbientSound[], keepAmbience = false): SoundGroup[] {
  return ORDER.map((id) => ({
    id,
    label: i18n.t(`ambient-sound:groups.${id}`),
    sounds: catalog.filter((sound) => soundGroupOf(sound) === id),
  })).filter((group) => group.sounds.length > 0 || (keepAmbience && group.id === "ambience"));
}
