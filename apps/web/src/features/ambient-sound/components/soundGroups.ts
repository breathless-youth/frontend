import type { AmbientSound } from "../catalog";

export type SoundGroupId = "noise" | "ambience";

export type SoundGroup = {
  readonly id: SoundGroupId;
  readonly label: string;
  readonly sounds: readonly AmbientSound[];
};

const LABELS: Record<SoundGroupId, string> = {
  noise: "노이즈",
  ambience: "주변 소리",
};

/**
 * 시트의 탭을 나눈다.
 *
 * 지금은 합성 여부(`kind`)가 그대로 갈림길이다. 코드가 만드는 노이즈 셋과 녹음된 장면 소리
 * 셋이 정확히 나뉘기 때문이다. lofi 음악이 들어오면 그것도 `kind: "file"` 이라 이 기준이 깨진다.
 */
export function soundGroups(catalog: readonly AmbientSound[]): SoundGroup[] {
  const noise = catalog.filter((sound) => sound.kind === "synth");
  const ambience = catalog.filter((sound) => sound.kind === "file");
  return [
    { id: "noise" as const, label: LABELS.noise, sounds: noise },
    { id: "ambience" as const, label: LABELS.ambience, sounds: ambience },
  ].filter((group) => group.sounds.length > 0);
}
