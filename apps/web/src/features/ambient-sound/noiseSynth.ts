export type NoiseKind = "white" | "pink" | "brown";

/** mulberry32. 같은 시드에 같은 출력을 내야 테스트와 재현이 가능하다. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillWhite(out: Float32Array, random: () => number): void {
  for (let i = 0; i < out.length; i += 1) out[i] = random() * 2 - 1;
}

/** Paul Kellet 의 핑크노이즈 근사 필터. 계수는 원문 그대로다. */
function fillPink(out: Float32Array, random: () => number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
}

/** 누설 적분. 누설이 없으면 값이 무한히 흘러가 DC 가 쌓인다. */
function fillBrown(out: Float32Array, random: () => number): void {
  let last = 0;
  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last;
  }
}

/**
 * 종류별 음량 보정 계수.
 *
 * 피크를 1로 맞추는 것만으로는 들리는 크기가 전혀 맞지 않는다. 화이트는 스펙트럼이
 * 평탄해 고역 에너지가 많고 브라운은 저역만 남는데, 사람 귀와 라우드니스 척도는
 * 중고역에 가중치를 둔다. 같은 피크로 맞춘 세 소리를 EBU R128로 재면 -1.8, -12.9,
 * -14.6 LUFS로 13dB 가까이 벌어진다. 그대로 두면 소리를 바꿀 때마다 음량이 튀고,
 * 화이트는 트루 피크가 +5dBTP라 혼자 켜도 찌그러진다.
 *
 * 아래 값은 4초 버퍼를 실제로 재서 셋 다 -18 LUFS가 되게 맞춘 것이다. 파일 음원도
 * 같은 -18 LUFS로 인코딩하므로 합성과 파일이 같은 기준에 놓인다.
 *
 * 필터 계수나 난수 생성을 바꾸면 이 값은 더 이상 맞지 않는다. 다시 재서 갱신해야
 * 하고, 그 사실을 테스트가 실효값으로 지키고 있다.
 */
const LOUDNESS_TRIM: Record<NoiseKind, number> = {
  white: 0.1556,
  pink: 0.5578,
  brown: 0.6769,
};

/** 피크를 1로 맞춘 뒤 종류별 음량 보정을 건다. 두 단계를 거쳐야 재현 가능한 값이 나온다. */
function normalize(out: Float32Array, kind: NoiseKind): void {
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  if (peak === 0) return;
  const scale = LOUDNESS_TRIM[kind] / peak;
  for (let i = 0; i < out.length; i += 1) out[i] *= scale;
}

export function createNoiseSamples(kind: NoiseKind, length: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  const random = createRandom(seed);
  if (kind === "white") fillWhite(out, random);
  else if (kind === "pink") fillPink(out, random);
  else fillBrown(out, random);
  normalize(out, kind);
  return out;
}
