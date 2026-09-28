import type { AmbientSound, SoundGroupId } from "../catalog";

export type { SoundGroupId };

export type SoundGroup = {
  readonly id: SoundGroupId;
  readonly label: string;
  readonly sounds: readonly AmbientSound[];
};

const LABELS: Record<SoundGroupId, string> = {
  noise: "노이즈",
  ambience: "주변 소리",
  music: "음악",
};

const ORDER: readonly SoundGroupId[] = ["noise", "ambience", "music"];

/**
 * 분류를 카탈로그가 들고 있지 않을 때의 대체 경로.
 *
 * 배포 순서가 어긋나 예전 카탈로그가 잡히면 모든 항목의 group 이 비는데, 그때 항목을
 * 버리면 화면에 소리가 하나도 안 남는다. 예전 기준인 합성 여부로 떨어뜨린다.
 */
function groupOf(sound: AmbientSound): SoundGroupId {
  return sound.group ?? (sound.kind === "synth" ? "noise" : "ambience");
}

export function soundGroups(catalog: readonly AmbientSound[]): SoundGroup[] {
  return ORDER.map((id) => ({
    id,
    label: LABELS[id],
    sounds: catalog.filter((sound) => groupOf(sound) === id),
  })).filter((group) => group.sounds.length > 0);
}
