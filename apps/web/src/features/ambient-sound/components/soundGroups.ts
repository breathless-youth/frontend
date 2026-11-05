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

export function soundGroups(catalog: readonly AmbientSound[]): SoundGroup[] {
  return ORDER.map((id) => ({
    id,
    label: i18n.t(`ambient-sound:groups.${id}`),
    sounds: catalog.filter((sound) => soundGroupOf(sound) === id),
  })).filter((group) => group.sounds.length > 0);
}
