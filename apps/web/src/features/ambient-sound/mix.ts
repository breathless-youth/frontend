import type { AmbientSound, SoundId } from "./catalog";

/** 키가 있으면 켜진 소리, 값은 1~100 레벨. 레벨 0 은 키를 지우는 것과 같다. */
export type Mix = Readonly<Partial<Record<SoundId, number>>>;

function without(mix: Mix, id: SoundId): Mix {
  const { [id]: _removed, ...rest } = mix;
  return rest;
}

/** 켜고 끄는 유일한 통로. 레벨 0 은 끈 것이라 키를 지운다. */
export function setLevel(mix: Mix, id: SoundId, level: number): Mix {
  const clamped = Math.min(100, Math.max(0, level));
  if (clamped === 0) return id in mix ? without(mix, id) : mix;
  return { ...mix, [id]: clamped };
}

export function activeIds(mix: Mix, catalog: readonly AmbientSound[]): SoundId[] {
  const ids: SoundId[] = [];
  for (const sound of catalog) {
    if (sound.id in mix) ids.push(sound.id);
  }
  return ids;
}
