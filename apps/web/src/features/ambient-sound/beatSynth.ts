export type BeatKind = "binaural" | "monaural";

const KINDS: readonly string[] = ["binaural", "monaural"];

export function isBeatKind(id: string): id is BeatKind {
  return KINDS.includes(id);
}

/**
 * 캐리어 200Hz 를 가운데 두고 좌우로 5Hz 씩 벌린다. 차이 10Hz 가 비트가 된다.
 *
 * 값을 바꾸려면 4를 곱해 정수가 되는 주파수에서 골라야 한다. 재생 버퍼가 4초라
 * 그 안에서 정수 번 진동해야 반복 지점에 클릭음이 생기지 않는다.
 */
const LEFT_HZ = 195;
const RIGHT_HZ = 205;

/**
 * -18 LUFS 에 맞춘 진폭. 노이즈 3종과 같은 기준이라 소리를 바꿔도 음량이 튀지 않는다.
 *
 * 사인파는 에너지가 한 주파수에 몰려 있어 같은 피크의 노이즈보다 크게 들린다. 피크만
 * 맞추면 비트만 혼자 크다. 모노럴은 두 음을 더한 뒤 반으로 나누므로 실효값이 루트 2
 * 만큼 떨어져, 같은 크기로 들리게 하려면 그만큼 키워야 한다.
 */
const BINAURAL_AMPLITUDE = 0.1414;
const MONAURAL_AMPLITUDE = 0.1978;

export function createBeatSamples(
  kind: BeatKind,
  length: number,
  sampleRate: number,
): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const leftStep = (2 * Math.PI * LEFT_HZ) / sampleRate;
  const rightStep = (2 * Math.PI * RIGHT_HZ) / sampleRate;

  for (let i = 0; i < length; i += 1) {
    const low = Math.sin(leftStep * i);
    const high = Math.sin(rightStep * i);
    if (kind === "binaural") {
      left[i] = low * BINAURAL_AMPLITUDE;
      right[i] = high * BINAURAL_AMPLITUDE;
    } else {
      const both = (low + high) * 0.5 * MONAURAL_AMPLITUDE;
      left[i] = both;
      right[i] = both;
    }
  }

  return { left, right };
}
