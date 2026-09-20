/**
 * 실기기 측정 시나리오 — 이 배열이 **유일한 출처**다. 런북은 개수와 대략의 소요시간만 말하고
 * 여기를 가리킨다. 측정이 끝나면 이 폴더와 함께 지운다.
 */

export interface MeasurementScenario {
  readonly id: string;
  readonly name: string;
  /** 측정하는 사람이 지금 무엇을 해야 하는지 한 문장. 패널이 그대로 띄운다. */
  readonly instruction: string;
  /**
   * 이 구간에서 무엇을 기대하는지. **사람이 읽는 문장이고 계산에 쓰지 않는다.**
   *
   * 자동 합격 판정을 두지 않기로 했다. 도구는 무슨 일이 있었는지만 남기고, 기대와 실제를
   * 맞춰 보는 일은 덩어리를 받는 사람이 한다. 이 문장이 덩어리의 그 구간에 함께 실려,
   * 나중에 읽는 사람이 그 구간이 무엇을 재려던 것인지 알게 한다.
   */
  readonly expected: string;
  /** 관찰을 시작하기 전에 기다리는 시간. 기준선을 채우거나 자세를 잡는 데 쓴다. */
  readonly prepareSec: number;
  readonly observeSec: number;
}

export const MEASUREMENT_SCENARIOS: readonly MeasurementScenario[] = [
  {
    id: "A1",
    name: "눈 감김 진입",
    instruction: "정면을 보다가 신호가 오면 눈을 감고 버티세요",
    expected: "10초쯤에 졸음으로 전이해야 한다",
    prepareSec: 10,
    observeSec: 30,
  },
  {
    id: "A2",
    name: "깨어남 복귀",
    instruction: "눈을 뜨세요. 바로 앞 A1에서 졸음이 잡혀 있어야 잴 수 있습니다",
    expected: "졸음이던 상태가 눈 뜬 뒤 5초 안팎에 풀려야 한다",
    prepareSec: 0,
    observeSec: 20,
  },
  {
    id: "A3",
    name: "깜빡임",
    instruction: "3초 감았다 뜨기를 세 번 반복하세요",
    expected: "깜빡임만으로는 40초 내내 졸음이 없어야 한다",
    prepareSec: 0,
    observeSec: 40,
  },
  {
    id: "A4",
    name: "내려다봄",
    instruction: "책이나 노트를 보며 공부하세요",
    expected: "5분 내내 졸음이 없어야 한다",
    prepareSec: 0,
    observeSec: 300,
  },
  {
    id: "A5",
    name: "엎드림",
    instruction: "정면을 보다가 신호가 오면 책상에 엎드리세요",
    expected:
      "엎드림 판정은 꺼져 있다. 엎드려도 졸음으로 전이하면 안 되고, person·AWAY 신호가 어떻게 움직이는지만 기록한다",
    prepareSec: 200,
    observeSec: 240,
  },
  {
    id: "A6",
    name: "엎드림 조기",
    instruction: "세션을 새로 시작하고 1분 뒤 엎드리세요",
    expected:
      "엎드림 판정은 꺼져 있다. 기준선 여부와 무관하게 졸음으로 전이하면 안 되고, 전이만 기록한다",
    prepareSec: 60,
    observeSec: 120,
  },
  {
    id: "A7",
    name: "몸만 배치 30초 노출",
    instruction: "몸만 찍히게 두었다가 30초만 얼굴을 보인 뒤 물러나세요",
    expected: "엎드림 판정은 꺼져 있다. 30초 노출도 졸음으로 전이하면 안 되고, 전이만 기록한다",
    prepareSec: 30,
    observeSec: 120,
  },
  {
    id: "A8",
    name: "몸만 배치 2분 노출",
    instruction: "2분간 얼굴을 보인 뒤 물러나세요",
    expected: "엎드림 판정은 꺼져 있다. 2분 노출도 졸음으로 전이하면 안 되고, 전이만 기록한다",
    prepareSec: 120,
    observeSec: 120,
  },
  {
    id: "A9",
    name: "몸만 배치 5분 노출",
    instruction:
      "5분간 얼굴을 보인 뒤 물러나세요. 엎드림 판정이 꺼져 있어 이 구간에서도 졸음은 나오지 않는다. 다시 켤 때 쓸 근거만 남기는 구간이다",
    expected:
      "엎드림 판정은 꺼져 있다. 5분을 넘겨도 졸음으로 전이하면 안 된다. 다시 켤 때 쓸 수 있게 얼굴 유무만 기록해 둔다",
    prepareSec: 300,
    observeSec: 120,
  },
  {
    id: "A10",
    name: "일시정지 후 엎드림",
    instruction: "3분 주시하고 일시정지했다 재개한 뒤 바로 엎드리세요",
    expected: "엎드림 판정은 꺼져 있다. 재개 뒤에도 졸음으로 전이하면 안 되고, 전이만 기록한다",
    prepareSec: 200,
    observeSec: 120,
  },
  {
    id: "A11",
    name: "휴대폰 우선순위",
    instruction: "휴대폰이 보이게 두고 눈을 감았다가, 휴대폰을 치우세요",
    expected:
      "휴대폰과 졸음의 우선순위를 본다. 어느 트리거로 갔다가 어디로 돌아오는지를 전이 목록에서 읽는다",
    prepareSec: 0,
    observeSec: 60,
    // 휴대폰이 먼저 잡혔다가 치웠을 때 집중이 아니라 졸음으로 넘어가는지를 보는 구간이다.
  },
  {
    id: "A12",
    name: "안경",
    instruction: "안경을 쓰고 눈을 감고 버티세요",
    expected: "안경을 써도 10초쯤에 졸음으로 전이해야 한다",
    prepareSec: 10,
    observeSec: 30,
  },
  {
    id: "A13",
    name: "저조도",
    instruction: "조명을 낮추고 눈을 감고 버티세요",
    expected:
      "저조도에서 눈 판정이 사는지 본다. 졸음이 나면 임계가 견딘 것이고, 안 나면 표본이 걸러진 것이다",
    prepareSec: 10,
    observeSec: 60,
  },
  {
    id: "A14",
    name: "자리 이탈 후 각도 변경",
    instruction: "자리를 비웠다가 카메라 각도를 바꿔 몸만 찍히게 하고 돌아오세요",
    expected:
      "엎드림 판정은 꺼져 있다. 각도를 바꿔 몸만 찍혀도 졸음으로 전이하면 안 되고, 전이만 기록한다",
    prepareSec: 0,
    observeSec: 120,
  },
  {
    id: "A15",
    name: "소셜룸",
    instruction: "소셜룸에서 눈을 감고 버티세요",
    expected: "소셜룸에서도 10초쯤에 졸음으로 전이해야 한다",
    prepareSec: 10,
    observeSec: 30,
  },
  {
    id: "A16",
    name: "눈 작은 사람",
    instruction: "다른 피험자가 A1을 반복합니다. 눈이 작은 분으로 부탁하세요",
    expected:
      "보정이 끝난 뒤 뜬 눈이 감김으로 읽히지 않고, 감으면 10초쯤에 졸음이어야 한다. 덩어리의 eyeCalibration에서 이 사람의 기준값과 임계를 함께 기록한다",
    // 준비가 긴 것은 자세를 잡기 위해서가 아니라 보정 30초를 채우기 위해서다. 보정 전에는
    // 고정 임계로 도므로 그 구간의 기록은 이 시나리오가 재려던 것이 아니다.
    prepareSec: 40,
    observeSec: 40,
  },
  {
    id: "A17",
    name: "눈 큰 사람",
    instruction: "다른 피험자가 A1을 반복합니다. 눈이 큰 분으로 부탁하세요",
    expected:
      "감았을 때 놓치지 않고 10초쯤에 졸음이어야 한다. 덩어리의 eyeCalibration에서 이 사람의 기준값과 임계를 함께 기록한다",
    // A16과 같은 이유로 준비가 길다.
    prepareSec: 40,
    observeSec: 40,
  },
  {
    id: "A18",
    name: "꾸벅꾸벅",
    instruction: "3초 감고 1초 뜨기를 1분간 반복하세요. 고개도 같이 떨어뜨리세요",
    expected:
      "연속 10초는 못 채우지만 비율 판정으로 1분 창이 찬 뒤 졸음이어야 한다. 멈춘 뒤 30초쯤에 풀리는 꼬리도 기록한다",
    prepareSec: 40,
    observeSec: 130,
  },
  {
    id: "A19",
    name: "고개 뒤로 젖힘",
    instruction: "고개를 뒤로 젖혀 천장을 보며 눈을 감으세요",
    expected: "그 각도에서 얼굴이 잡히면 10초쯤에 졸음이다. 얼굴을 놓치면 그 사실을 기록한다",
    prepareSec: 10,
    observeSec: 40,
  },
];

function shrink(seconds: number, divisor: number): number {
  if (seconds === 0) {
    return 0;
  }
  // 0초 관찰은 아무것도 담지 못한다. 아무리 줄여도 1초는 남긴다.
  return Math.max(1, Math.round(seconds / divisor));
}

/**
 * 리허설용으로 시간을 줄인다.
 *
 * 절차 점검이 목적이라 유지시간·기준선을 실제로 채우지 못한다. 그래서 여기서 나온 기록은
 * 본 측정의 기록이 아니다. 패널과 덩어리가 리허설임을 따로 표시하는 이유다.
 */
export function scaleScenarios(
  scenarios: readonly MeasurementScenario[],
  divisor: number,
): readonly MeasurementScenario[] {
  if (divisor <= 1) {
    return scenarios;
  }
  return scenarios.map((scenario) => ({
    ...scenario,
    prepareSec: shrink(scenario.prepareSec, divisor),
    observeSec: shrink(scenario.observeSec, divisor),
  }));
}

/** 한 바퀴에 걸리는 시간. 런북이 "대략 몇 분"이라고 말할 근거다. */
export function totalScenarioSec(scenarios: readonly MeasurementScenario[]): number {
  return scenarios.reduce((sum, scenario) => sum + scenario.prepareSec + scenario.observeSec, 0);
}
