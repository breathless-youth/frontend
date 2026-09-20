# 졸음(SLEEP) 감지 (BY-699)

- 날짜: 2026-09-20
- 티켓: BY-699 사용자는 공부 중 졸았던 시간이 순공시간에서 빠지고 기록에 남는 것을 확인할 수 있어야 한다
- 하위 작업: BY-700(준비) · BY-701(얼굴 모델 모듈) · BY-702(SLEEP 상태 반영) · BY-703(연결) · BY-704(실기기 검증) · BY-705(머리 아비터, 후속) · BY-706(BE, `SLEEP` 값 추가)
- 연관: [vision 파이프라인 설계](./2026-07-27-study-session-vision-pipeline-design.md) §2·§3·§4·§8·§12, [세션 상태 모델 설계](./2026-07-26-session-state-model-and-contract-design.md) §3

## 문제

스터디룸은 비집중 3종(AWAY·PHONE·DEVICE)만 감지한다. 엎드려 자거나 눈을 감고 조는 시간은 EfficientDet이 `person`을 계속 잡기 때문에 순공시간에 그대로 들어간다. 졸음을 4번째 비집중 트리거로 추가해 그 시간을 순공에서 빼고, 결과(S4)와 기록(S5)에 별도 유형으로 보여준다.

저장소에는 졸음 관련 결정·문구·Figma·티켓이 없었다. 코드 주석이 참조하는 `ai-wiki/*`도 실제로는 존재하지 않는다. 이 문서가 첫 결정 기록이다.

## 인터뷰로 확정한 결정

| 항목              | 결정                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 세션 영향         | 4번째 비집중 트리거. 확정 시 `DISTRACTION` 전이, 순공 정지·총공부 진행, 서버 status 이벤트로 기록, S4·S5에 표시                                                                                                                                                                                                                             |
| 졸음 정의         | 두 규칙, 사용자에게는 하나의 "졸음". (a) 눈 감김 지속: 얼굴 검출 + 양쪽 눈 감김 점수 임계 이상 유지. (b) 엎드림(얼굴 소실): `person`은 검출되는데 얼굴이 안 잡히는 상태 유지, 단 얼굴이 최근 3분간 80% 이상 안정적으로 보였을 때만                                                                                                          |
| 엎드림 2단계      | 1단(V1): 위 기준선. 2단(후속): 자세 모델(PoseLandmarker)로 "머리가 화면 안에 있는가"를 판별하는 아비터를 얼굴이 사라진 구간에서만 돌려 엎드림과 몸만 찍힘을 구분. 실기기 검증 통과 후 `HeadPresenceRule` 주입점에 끼운다                                                                                                                    |
| 서버 명세         | 백엔드가 `StudyEventStatus`에 `SLEEP` 추가(값 이름 합의 완료, Swagger 반영 시점 미정). FE는 잠정 표시로 먼저 반영하고 등재 후 대조. 임시 매핑 없음. 이 잠정 등재는 CLAUDE.md의 "Swagger 기준으로만 정의" 규칙에 대한 의도된 예외다(전례: `packages/types`의 `RoomJoin*` 잠정 명세). 등재 뒤 리터럴을 대조하고 docblock의 잠정 표시를 지운다 |
| BE 전 자체 테스트 | 한다. 서버 전송은 BE에 enum 값 수락만 선반영 요청이 1순위, 안 되면 dev 배포 한정 wire 호환(SLEEP→AWAY)이 2순위                                                                                                                                                                                                                              |
| 디자인            | 기존 3종 패턴 그대로(같은 오렌지, 같은 필·통계 행·칩). 문구만 추가하고 리더 확인 항목으로 표시                                                                                                                                                                                                                                              |
| 알림              | 없음. S3-1 스펙의 "알림·소리·진동을 쓰지 않는다" 유지                                                                                                                                                                                                                                                                                       |
| 모델              | 기존 `@mediapipe/tasks-vision` 1.0.0의 `FaceLandmarker` + `outputFaceBlendshapes`. 모델 파일 `face_landmarker.task`(float16 ≈3.7MB)는 `public/models/`에 커밋                                                                                                                                                                               |
| 오류 방향         | 정밀도 우선. "깨어 있는데 졸음 판정" = 0을 목표로 하고 15~20초 미만 짧은 졸음 누락은 허용                                                                                                                                                                                                                                                   |
| 킬 스위치         | 없음. 실기기 검증을 출시 게이트로 삼는다. 롤백은 웹 배포 revert(웹이 원격 URL이라 앱 릴리즈 불필요)                                                                                                                                                                                                                                         |

## 최우선 제약

1. 배터리·발열은 지금과 측정으로 구분되지 않아야 한다. 추론을 하나 더 얹으므로 0 차이는 불가능하고, BY-305와 같은 프로토콜로 합격을 판정한다(검증 절 3).
2. 정확도는 100%에 가깝게. 카메라 기반으로 모든 상황 100%는 불가능하다. 정밀도 우선으로 임계·게이트·유지시간을 잡고, 임계값으로 못 푸는 잔여 실패 모드는 알려진 한계로 명시한다.

## 설계 A. Vision 파이프라인 (`apps/web/src/features/study-session/`)

데이터 흐름: `frameLoop`(500ms) → `objectDetector.detect()` → `evaluateFrame()` → [처리 프레임 4개마다, person 있을 때만] `faceLandmarker.detect()` → `evaluateSleep()` → `publish({AWAY, PHONE, SLEEP_EYES, SLEEP_FACE})` → 훅 → `stepDetection`(출처별 유지시간) → 트리거 `SLEEP`.

### 새 파일

| 파일                                                                             | 역할                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vision/mediapipePort.ts`                                                        | `objectDetector.ts`의 포트 타입을 그대로 옮기고 FaceLandmarker 포트를 추가한다. `MediapipeVisionRuntime`에 `createFaceLandmarker(options)`가 생긴다. `objectDetector.ts`는 re-export로 기존 import를 유지한다(두 래퍼 사이 타입 순환 회피)                                                                   |
| `vision/faceLandmarker.ts`                                                       | `objectDetector.ts`와 같은 구조의 래퍼. `idle/loading/ready/unavailable`, `load()`는 throw하지 않음, 1회 재시도, 연속 실패 5회, `wanted` 플래그, `loadRuntime`/`delegateOrder` 주입. Sentry 태그 `vision-face-create-{delegate}`, `vision-face-frame-loop`, `vision-face-blendshape-missing`(인스턴스당 1회) |
| `vision/sleepRules.ts`                                                           | 순수 규칙. `SleepFrame { personPresent, personScore, face: FaceObservation \| null, faceStable, headInFrame }` → `SleepSignals { eyesClosed, faceLost }`. `SleepRule`·`HeadPresenceRule` 인터페이스로 교체 가능                                                                                              |
| `vision/__tests__/faceLandmarker.test.ts`, `vision/__tests__/sleepRules.test.ts` | fake 런타임·픽스처만으로 도는 테스트                                                                                                                                                                                                                                                                         |
| `public/models/face_landmarker.task`                                             | float16 v1 ≈3.7MB, 커밋. 출처 URL·sha256은 `visionConfig.ts`의 `FACE_MODEL_PATH` docblock에 기록                                                                                                                                                                                                             |

### 정규화 결과. 좌표는 이 경계를 넘지 않는다

```ts
export interface FaceObservation {
  readonly facePresent: boolean; // 품질 무관. 엎드림 규칙이 본다
  readonly eye: Readonly<Record<EyeBlendshapeName, number>> | null; // 품질 게이트 통과 시만. null = 이번 프레임 눈 판정 없음
  readonly eyeSkipReason: "no-face" | "face-too-small" | "blendshapes-missing" | null;
}
```

`normalize()` 순서: 얼굴 없음 → `no-face` / 눈 바깥꼬리 랜드마크(33·263) 정규화 간격 < `MIN_INTER_OCULAR_NORMALIZED` → `face-too-small`(거리값은 저장·반환·로그하지 않음) / 블렌드셰이프 이름 누락 → `blendshapes-missing` + Sentry 1회 / 통과 → 스칼라 4개. FaceLandmarker 결과에는 얼굴별 신뢰도가 없으므로(`vision.d.ts` `FaceLandmarkerResult`) 신뢰도 게이트는 생성 옵션 0.6으로만 건다.

### 규칙 `defaultSleepRule`

- `eyesClosed` = person 있음 ∧ `eye !== null` ∧ 최근 3표본 중앙값 기준 `min(eyeBlinkLeft, eyeBlinkRight) ≥ 0.45`. 내려다봄 거부권은 두지 않는다. 스파이크에서 눈을 감으면 `eyeLookDown*`가 0.6~~0.8로 오르고 책을 볼 때는 0.07~~0.33이라, 거부권은 진짜 졸음을 막는 쪽으로만 동작했다. 책을 볼 때 감김 점수 최대는 0.36~0.38이라 거부권 없이도 오탐이 없다. 중앙값을 쓰는 이유는 깜빡임 한 표본(최대 0.57)이 10초 유지시간을 초기화하거나 진입시키지 않게 하기 위해서다.
- `faceLost` = person 있음 ∧ `!facePresent` ∧ `personScore ≥ 0.5` ∧ `faceStable` ∧ `headInFrame !== false`. 사람 점수 조건은 어두워져 person 점수도 떨어지면 엎드림으로 치지 않기 위한 것이다. `facePresent`는 최근 3표본 다수결로 부드럽게 한다. 엎드림 중 1~2표본 오검출이 25초 유지시간을 초기화하지 않게 하기 위해서다.
- 기준선 `faceStable`(몸만 찍는 사용자 방어): 어댑터가 얼굴 틱 결과(있음/없음)를 최근 `FACE_BASELINE_WINDOW_MS`(3분, 2초 샘플링 = 90개) 링버퍼에 쌓고, 버퍼가 가득 찼고 얼굴 있음 비율 ≥ `FACE_BASELINE_MIN_RATIO`(0.8)일 때만 참이다. 진입에만 쓰고 래치한다. 한 번 `faceLost`가 켜지면 얼굴이 돌아오거나 person이 사라질 때까지 비율과 무관하게 유지한다(잠든 시간이 길어져 비율이 떨어져도 해제되지 않게). 세션 첫 3분과 `stop()` 직후 3분은 엎드림 판정이 없다. 남는 오탐은 몸만 찍던 사용자가 3분 넘게 얼굴을 보이다 물러나는 경우이고, 이것이 2단 아비터가 맡는 부분이다.
- 2단 아비터 `HeadPresenceRule`(후속): `sleepRules.ts`에 `headInFrame: boolean | null` 입력과 `HeadPresenceRule { evaluate(frame): boolean | null }` 주입점을 V1부터 둔다. 후속에서 PoseLandmarker(lite) 래퍼를 `faceLandmarker.ts`와 같은 구조로 추가하고, person 있음 ∧ 얼굴 없음 ∧ `faceStable`인 후보 구간에서만 얼굴 틱 주기로 돌려 코·눈·귀 랜드마크가 프레임 안에 있으면 머리 있음(엎드림), 프레임 밖이면 몸만 찍힘(거부)으로 판정한다. 후보 구간에서만 돌므로 발열 영향은 그 구간에 한정된다. 엎드린 자세에서의 정확도는 미검증이다.
- 품질 게이트 실패 = "판정 없음"(직전 원신호 유지)이지 "눈 뜸"이 아니다.

### `visionConfig.ts` 새 상수(전부 튜닝 대상)

```ts
export const FACE_MODEL_PATH = "/models/face_landmarker.task";
export const FACE_LANDMARKER_OPTIONS = {
  numFaces: 1,
  minFaceDetectionConfidence: 0.6,
  minFacePresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
} as const;
export const FACE_FRAME_DIVISOR = 4; // 처리 프레임 4개마다(=2초). 발열 예산의 손잡이
export const FACE_BLENDSHAPE_ALLOWLIST = [
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
] as const;
export const EYE_OUTER_CORNER_LANDMARKS = { left: 33, right: 263 } as const;
export const MIN_INTER_OCULAR_NORMALIZED = 0.07; // 0.06 근처는 얼굴 검출 자체가 35%라 검출기가 먼저 거른다
export const SLEEP_THRESHOLDS = { eyeClosure: 0.45, faceLostPersonScore: 0.5 } as const;
export const FACE_SMOOTHING_SAMPLES = 3; // 눈 감김 중앙값·얼굴 유무 다수결 창
export const FACE_BASELINE_WINDOW_MS = 180_000; // 엎드림 기준선 창(3분)
export const FACE_BASELINE_MIN_RATIO = 0.8; // 창 안 얼굴 있음 비율 최소값
```

`mediapipeModule.ts`의 `createFaceLandmarker`는 `runningMode: "VIDEO"`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: false` 고정이다(비용이고 자세 행렬은 위치 정보다). delegate는 `DELEGATE_ORDER`(CPU)를 재사용한다.

### 스케줄링과 발열 예산

- 얼굴 추론은 같은 `onFrame` 안에서 EfficientDet 뒤에, `frameIndex % FACE_FRAME_DIVISOR === 0` ∧ `personPresent` ∧ 얼굴 래퍼 `ready`일 때만 돈다.
- 얼굴 모델 `load()`는 객체 검출기가 `ready`가 된 뒤에 건다(`ensureLoaded().then`). 첫 호출 프리즈(S3 8~15초)가 겹치지 않고 AWAY/PHONE 첫 판정 시각이 바뀌지 않는다.
- 산술: 추가 듀티 = F / (N × 500ms). N=4에서 +5%p ⇔ F ≤ 100ms, N=6 ⇔ 150ms, N=8 ⇔ 200ms. `E + F > 500ms`면 다음 틱이 버려져 2.5초마다 1초 공백이 생기므로 "버림 0"이 합격 기준이다.
- 기각한 대안: 매 틱 실행(BY-305 포화 재현), 틱 교대(PHONE 1Hz, `visionConfig.ts`의 1000ms 기각 사유 그대로), 워커(기존 스펙 §12의 별도 티켓, N이 충분하면 불필요).

### `adapters/focusDetector.ts` 연결

- `DetectorSignal`은 `{ source: DetectionSource, active }`로 바뀐다(설계 B). `VISION_SOURCES = ["AWAY","PHONE","SLEEP_EYES","SLEEP_FACE"]`, `emitted: Record<VisionSource, boolean> | null`. 첫 publish는 전부 내보내서(`SLEEP_* = false` 포함) 일시정지 전 훅에 남은 오래된 `true`를 덮는다(`deviceHandlingDetector.ts`가 의존하는 성질).
- 새 옵션: `faceLandmarker?`(테스트 주입), `sleepRule?`, `headRule?`, `sleepDetection?: boolean`(기본 `true`. DEV 또는 `?diag=1`에서만 `?sleep=0`으로 끈다. 실기기 A/B용이며 `resolveModelVariant` 패턴). 새 공개면: `faceStatus`, `subscribeFaceStatus`. 기존 `status`는 객체 검출기 의미를 유지한다.
- 상태: `lastFace`(얼굴 틱 사이 유지, `!personPresent`면 null), `faceHistory`(최근 3분 얼굴 유무 링버퍼 → `faceStable`, `stop()`·`close()`에서 비움), `faceLostLatched`(진입 후 래치), `frameIndex`.
- 얼굴 `unavailable` + 객체 `ready`: SLEEP 출처는 영원히 false, AWAY/PHONE 무영향. 객체 `unavailable`: 루프가 이미 멈춰 얼굴 로드 자체를 걸지 않는다. `close()`는 둘 다 닫는다.
- `DevVisionFailureNotice.tsx`: 얼굴 실패 줄 추가(`data-dev-notice="face-unavailable"`, `subscribeFaceStatus`). `RoomPage.tsx`·`LiveRoomSession.tsx`는 둘 다 `createVisionFocusDetector({ video })`를 쓰므로 소셜룸도 자동 적용된다.
- 주석 갱신: `focusDetector.ts`의 "Vision은 AWAY/PHONE만" 서술과 `frameLoop.ts`의 같은 서술을 "Vision은 AWAY/PHONE/SLEEP_EYES/SLEEP_FACE, 가속도는 DEVICE"로 바꾼다.

### 진단(`vision/diagnostics.ts`, 스칼라만)

`sleepEyesSignal`, `sleepFaceSignal`, `faceBaseline`, 얼굴 틱에서만 `face:ran/present/eyeBlinkLeft…/skip/durationMs/delegate`(null 키는 생략). 새 이벤트 `face:ready`, `face:unavailable`. 기존 스펙 §8 표에 추가한다.

| 남긴다                                 | 남기지 않는다                                      |
| -------------------------------------- | -------------------------------------------------- |
| 얼굴 유무 (boolean)                    | 얼굴 랜드마크 좌표 478점 전부                      |
| 눈 blendshape 4종 점수(소수 둘째 자리) | 나머지 blendshape 48종(표정 벡터)                  |
| 눈 판정 생략 사유(문자열 enum)         | 눈 간격 등 크기·거리 스칼라(bbox 크기와 같은 성격) |
| 졸음 원신호 2종 · 기준선 상태          | 얼굴 변환 행렬(생성 자체를 끈다)                   |
| 얼굴 추론 소요시간 · delegate          |                                                    |

### 라이선스와 자산

- `features/settings/openSourceLicenses.ts`에 "MediaPipe Face Landmarker" 항목을 추가한다(Apache-2.0, Copyright Google LLC, role은 졸음 감지·온디바이스 명시). EfficientDet `role`에 drowsiness를 더하고 헤더의 "세 항목"을 "네 항목"으로 바꾼다. `settingsSubPages.test.tsx`는 항목을 순회하므로 무변경이다.
- `scripts/copyMediapipeWasm.js`와 `.gitignore` 주석에 `.task`도 커밋 대상임을 추가한다. `docs/handoff/2026-08-01-by-332-…md` 표에 `curl -I <url>/models/face_landmarker.task` 행을 추가한다(`text/html`이면 안 된다).

## 설계 B. 세션 모델·명세·UI

### `detection.ts`. 출처 계층 도입(디바운서는 하나)

트리거(사용자·서버 단위) 아래에 원신호 출처 계층을 둔다. AWAY·PHONE·DEVICE는 출처가 하나라 이름이 같고 동작이 바이트 단위로 동일하다. SLEEP만 출처가 둘이다.

```ts
export const DETECTION_SOURCES = ["AWAY", "PHONE", "DEVICE", "SLEEP_EYES", "SLEEP_FACE"] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];
export const SOURCE_TRIGGER = { AWAY: "AWAY", PHONE: "PHONE", DEVICE: "DEVICE", SLEEP_EYES: "SLEEP", SLEEP_FACE: "SLEEP" }
  as const satisfies Record<DetectionSource, DistractionTrigger>;
export type DetectionParams = Record<DetectionSource, TriggerHoldParams>;
export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  AWAY: { enterMs: 1500, exitMs: 2000 }, PHONE: { enterMs: 500, exitMs: 1500 }, DEVICE: { enterMs: 500, exitMs: 2000 },
  SLEEP_EYES: { enterMs: 10_000, exitMs: 3000 },   // 잠정. 실기기 정밀도 측정 후 확정
  SLEEP_FACE: { enterMs: 25_000, exitMs: 3000 },   // 잠정. 정밀도가 낮아 더 길게. 결과에 따라 45~60초 또는 비활성
};
const TRIGGER_PRIORITY_RANK = { AWAY: 0, DEVICE: 1, SLEEP: 2, PHONE: 3 } as const satisfies Record<DistractionTrigger, number>;
export const TRIGGER_PRIORITY = Object.keys(TRIGGER_PRIORITY_RANK) as readonly DistractionTrigger[];
export type TriggerSignals = Record<DetectionSource, boolean>;   // 이름 유지, 의미는 "출처별"
```

- `stepDetection`의 유지시간 루프는 `DETECTION_SOURCES` 순회로 바뀔 뿐 본문은 지금과 동일하다. 트리거 확정 = 그 트리거에 속한 출처 중 하나라도 확정(`isTriggerConfirmed`). 대표 선택 규칙 (a) 이미 활성이면 그 출처가 전부 해제될 때까지 유지, (b) 새로 고를 때만 우선순위는 그대로다.
- `NO_TRIGGER_SIGNALS`·`createDetectionState`는 `DETECTION_SOURCES`에서 채운다(`fillSources`). enum은 쓰지 않는다(`erasableSyntaxOnly`).
- "모든 트리거에 출처가 1개 이상"은 런타임 테스트로 고정한다. `new Set(Object.values(SOURCE_TRIGGER))`가 `new Set(TRIGGER_PRIORITY)`와 같다.
- 우선순위 `AWAY > DEVICE > SLEEP > PHONE`. DEVICE 아래인 이유는 두 SLEEP 출처가 카메라 판정이라 기기가 흔들리는 동안 신뢰할 수 없어서다. PHONE 위인 이유는 책상 위 휴대폰 오탐보다 10초 이상 유지된 졸음이 더 구체적이어서다. 실제로는 PHONE `enterMs`가 500ms라 SLEEP 확정 시점엔 PHONE이 이미 활성인 경우가 많고 규칙 (a)로 PHONE이 유지된다. 이 순서가 실제로 바꾸는 것은 같은 틱 동률과, PHONE 해제 시 FOCUS가 아니라 SLEEP으로 넘어가는 hand-off다. 둘 다 테스트로 고정한다.
- 기각한 대안: 어댑터가 출처별 디바운스 후 SLEEP 하나만 emit(어댑터 디바운스 금지, 튜닝 표면이 흩어짐) / 두 출처를 OR로 합쳐 단일 유지시간(정밀도가 다른 두 출처를 한 값으로 묶을 수 없음) / `trigger` 필드 이름을 유지하고 타입만 넓힘(`trigger`에 `"SLEEP_EYES"`가 실리면 이름이 거짓이 된다).

### `DetectorSignal.trigger` → `source` 이름 변경(기계적)

`focusDetector.ts`, `deviceHandlingDetector.ts`, `devMockDetector.ts`(문서 문자열), `useStudyRoomSession.ts`(`[signal.source]: signal.active`). 테스트: `RoomPage.test.tsx`, `useStudyRoomSession.analytics.test.tsx`, `deviceHandlingDetector.test.ts`, `visionFocusDetector.test.ts`("DEVICE는 절대 내지 않는다" 단언 유지 + `VISION_SOURCES` 밖 값 없음 단언 추가).

### 완전성 가드(알리지 않고 틀리는 실패 방지)

- `sessionState.ts`: `DistractionTrigger = "AWAY" | "PHONE" | "DEVICE" | "SLEEP"`. docblock에 "`toEventStatus` 반환 타입이 명세 부분집합 관계를 컴파일 타임에 강제한다(의도된 순서 게이트)"를 적는다.
- `sessionResult.ts`: `DISTRACTION_ROW_ORDER = { AWAY:0, PHONE:1, DEVICE:2, SLEEP:3 } as const satisfies Record<Exclude<StudyEventStatus,"PAUSE">, number>`, `DISTRACTION_STATUSES = Object.keys(...)`.
- `restoreActiveSession.ts`: `KNOWN_EVENT_STATUSES = { PHONE, DEVICE, AWAY, SLEEP, PAUSE: true } as const satisfies Record<StudyEventStatus, true>` → `EVENT_STATUSES = new Set(Object.keys(...))`. 실제 실패 모드는 "SLEEP 이벤트만 누락"이 아니라 `isUsableEvent`가 false를 돌려 `restoreActiveSession`이 `null`이 되어 진행 중 세션 복원을 통째로 포기하는 것이다.
- `sessionCopy.ts`: `satisfies Record<DistractionTrigger, SessionStatusCopy>`로 올린다.
- `packages/types/src/index.ts`: `StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "SLEEP" | "PAUSE"`. 잠정 표시와 BE 합의 근거를 docblock에 적고 Swagger 등재 후 리터럴을 대조한다. 런타임 상수는 추가하지 않는다(types 전용 패키지).

### 문구(전부 리더 확인 대상. 코드가 참조하는 voice-tone 위키는 존재하지 않는다)

- `sessionCopy.ts`: `SLEEP: { label: "졸고 있는 것 같아요", subLabel: "깨어나면 자동으로 다시 측정돼요" }`. 눈 감김·엎드림을 한 문구로 덮고 추정형 어미를 유지한다. 대안은 subLabel "다시 집중하면 자동으로 다시 측정돼요"다.
- `resultCopy.ts`: `SLEEP: "졸음"`. `recordsFormat.ts`: `SLEEP: "졸음"`, 순서 `{ AWAY:0, PHONE:1, DEVICE:2, SLEEP:3, PAUSE:4 }`.
- 표시 계층(`toPillState`, `SessionStatusPill`, `DistractionStatsCard`, `StudyTimelineCard`, `EventChip`, `LiveRoomSession`, 온보딩)은 트리거 무관이라 무변경이다.

### 나머지 연결

- `lib/amplitude.ts`: `lib/`는 `features/`를 import하지 않으므로 명세에서 파생한다. `Exclude<StudyEventStatus,"PAUSE">` / `StudyEventStatus`. 새 이벤트 속성은 없다(출처 구분은 진단 싱크 몫).
- `packages/design-tokens/src/index.ts`: `SLEEP: sessionStateColors.DISTRACTION`. `tokens.test.ts` 키 5개 + 동일 색 단언. 새 색은 없다.
- `sessionRequestClamp.ts`(PAUSE만 특수 처리)·`submitStudySession.ts`·`reportActiveSession.ts`·`closeStaleSession.ts`·`homeSummary.ts`는 status를 열거하지 않아 무변경이다.
- BE 호환은 양방향으로 확인했다. BE가 먼저 `eventCounts.SLEEP`을 내려도 웹은 자기 키 목록만 순회해 무시하고, 웹이 먼저 나가도 `undefined > 0 === false`라 칩도 크래시도 없다.

### 문서

- `docs/domain-glossary.md` 표에 `SLEEP | 졸음 | DISTRACTION`, "3종"을 4종으로.
- `docs/screens/SCR-S3-1-S3-2-…md` 문구 표(리더 확인)·감지 표·유지시간 표(잠정 표기). `SCR-S4-…md`, `SCR-S5-…md`의 유형 목록과 라벨 매핑. 유니언을 인용한 `SCR-S3-3/S3-5/S3-7` 줄. `2026-07-26-session-state-model-…md` §3·§4에 날짜 달린 포인터 한 줄.
- `2026-07-27-study-session-vision-pipeline-design.md` §8 표·§12 행(얼굴 모델, N, 임계).
- ADR은 만들지 않는다. 세션 모델·명세 소유권·어댑터 경계가 바뀌지 않아 구조 변경이 아니다.
- 비코드 후속(여기서 고치지 않음): `features/settings/legalDocuments.ts`의 개인정보처리방침 문구가 감지 상태를 열거하므로 졸음(눈 상태·자세 분석)을 리더/법무 소유자가 추가한다. 화면 스펙이 최근 "비집중→휴식" 문구 이관을 반영하지 못한 줄(`SCR-S4`, `SCR-S3-1`)도 별건이다.

## PR 분할과 순서(BE 의존성 기준)

| 티켓                     | 내용                                                                                                                                                                                  | 의존                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| BY-700 준비(동작 변화 0) | 이 스펙 커밋 · `detection.ts` 출처 계층(항등 `SOURCE_TRIGGER`, 3 출처) · `DetectorSignal.source` 이름 변경 · 완전성 가드 4곳 · Amplitude 유니언 파생 · `detection.test.ts` 불변식 2개 | 없음                                 |
| BY-701 Vision 순수 모듈  | `mediapipePort.ts` 추출 · `faceLandmarker.ts` · `sleepRules.ts` · `visionConfig` 상수 · `mediapipeModule.createFaceLandmarker` · `diagnostics` 타입 · 모델 자산 · 라이선스 · 테스트   | 없음(연결 전이라 어디에도 붙지 않음) |
| BY-702 명세 반영         | `packages/types` `SLEEP`(잠정) · `DistractionTrigger` · `DETECTION_SOURCES`에 `SLEEP_*` + 파라미터 + 우선순위 · 문구 · 토큰 · 복원 가드 · S4 행 · 테스트 · 문서                       | BY-700. BE 등재를 기다리지 않는다    |
| BY-703 Vision 연결       | `focusDetector.ts`(얼굴 틱·기준선 링버퍼·래치·publish 4출처) · `DevVisionFailureNotice` · `?sleep=0` DEV 오버라이드 · 어댑터 테스트                                                   | BY-700 + BY-701 + BY-702             |
| BY-704 실기기 검증       | 아래 체크리스트, 결과를 기존 스펙 §10 형식으로 기록, 상수 확정                                                                                                                        | BY-703 dev 배포본 + `?diag=1`        |
| BY-705 머리 아비터(후속) | PoseLandmarker 래퍼 · `HeadPresenceRule` 구현 · 후보 구간 한정 실행 · 테스트 · 라이선스 항목                                                                                          | BY-704 항목 9~10 통과                |

### BE 전 자체 테스트

- 감지·상태기계·필 문구·타이머·S4 행은 전부 클라이언트라 서버 없이 검증된다(브라우저 `?diag=1`, 실기기 dev 배포, 단위 테스트 픽스처). S5 기록 칩만 서버 `eventCounts`가 있어야 보인다. 그것은 픽스처 테스트로 대신하고 BE 등재 후 실기기로 확인한다.
- 문제는 전송이다. 서버가 모르는 `status: "SLEEP"`이 30초 스냅샷·최종 제출에 실리면 400으로 세션이 유실된다. 대응 순서:
  1. BE(BY-706)에 enum 값 `SLEEP` 수락만 선반영을 요청한다(통계·`eventCounts`는 나중이어도 된다). 1순위이고 이러면 우회 코드가 필요 없다.
  2. 안 되면 dev 배포 한정 wire 호환을 둔다. `VITE_SLEEP_WIRE_COMPAT=1`일 때 `toStatusEvents`가 `SLEEP`을 `AWAY`로 바꿔 보내고 `console.warn`으로 표시한다. dev Vercel 프로젝트에만 설정하고 prod에는 절대 설정하지 않으며, BE 등재 시 코드째 제거한다. 화면은 SLEEP으로 보이고 dev 서버 데이터만 AWAY로 남는다.
  3. 로그인 없는 세션(`userId === null` → `unsaved`)은 전송 자체가 없어 브라우저 빠른 확인용으로 쓴다.

출시 게이트: Swagger 등재 대조 + 실기기 검증 3(발열)·4~6(정밀도) 통과 후 prod 웹 배포. 실패 시 웹 배포 revert가 롤백 경로다(앱 릴리즈 불필요).

## 실기기 검증(BY-704, 튜닝 확정 전 필수)

기기: iPhone 17 Pro(WKWebView) + Android WebView 1종. `?diag=1` + `?sleep=0/1`로 A/B.

1. 블렌드셰이프 이름이 런타임에 실제로 오는가(`face:skip`이 `blendshapes-missing`이 아님), 랜드마크 33/263이 `FACE_LANDMARKS_LEFT_EYE/RIGHT_EYE`와 맞는가.
2. `face:durationMs` 분포(추적 정상 vs 추적 실패 직후), p95(`durationMs + face:durationMs`) vs 500ms, 버려진 틱 수(선택: `frameLoop`에 `onDrop` 훅 + `vision:frame-dropped`).
3. 발열 합격 기준: BY-305 프로토콜(16분 세션) 재현, 기준(`sleep=0`) vs 적용(`sleep=1`). 통과 = 어느 분에도 thermal state가 기준보다 나쁘지 않음 ∧ `WebKit.WebContent` CPU%(2~16분 평균) +5%p 이내 ∧ p95(E+F) ≤ 500ms ∧ 버림 0. 실패 → N 4→6→8. N=8에서도 실패하면 출시를 보류하고 워커 이전 티켓이 선행 조건이 된다.
4. `eyeBlink*` 분포: 눈 뜸 / 감음 / 책 내려다봄 / 안경 / 저조도 → `eyeClosure` 재확정(피험자 3명 이상), 신뢰도 0.6이 독서 각도에서 얼굴을 놓치는지. 2026-09-20 스파이크(피험자 1명) 결과는 아래 절.
5. 독서 각도·프로필 뷰에서 얼굴 검출 생존 → `SLEEP_FACE.enterMs`(25초 vs 45~60초) 또는 엎드림 규칙 비활성 결정.
6. 엎드렸을 때 EfficientDet이 `person ≥ 0.5`를 유지하는가. 아니면 AWAY가 먼저 잡혀 자리 이탈로 기록된다(타이머는 맞고 라벨만 다르다). 그 경우 엎드림 규칙은 "손에 얼굴 기댐·얼굴 가림"만 담당한다.
7. 얼굴 모델 첫 호출 프리즈(순차 로딩으로 객체 검출기 프리즈와 겹치지 않는지).
8. 깨어남 지연: 눈 뜸 → 재개(기대 ≤ 2초 + 3초).
9. 몸만 찍는 배치 재현: 몸만 찍다 얼굴을 30초·2분·5분 노출 후 물러남 → 3분/80% 기준선이 30초·2분은 거르고 5분은 못 거르는지 확인(5분 케이스가 2단 아비터의 존재 이유).
10. (2단) PoseLandmarker lite를 후보 구간에서만 실행할 때 프레임당 ms, 엎드린 자세·손에 얼굴 기댐·몸만 찍힘 세 상황에서 코·눈·귀 랜드마크의 프레임 내 여부와 presence 분포가 갈리는지. 갈리면 BY-705, 안 갈리면 엎드림은 기준선만으로 가고 한계로 명시한다.

### 임계값으로 못 푸는 잔여 실패 모드

| 모드                                             | 효과                                        | 처리                                                                        |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------- |
| 선글라스·색안경                                  | 눈 감김 오판 가능                           | 0.65 + 10초로 완화. 알려진 한계, 추정형 문구 유지                           |
| 앞머리·손으로 눈 가림                            | 같음                                        | 손은 보통 유지시간보다 짧다. 알려진 한계                                    |
| 세션 중 조명 끔                                  | person 남고 얼굴 소실                       | `faceLostPersonScore ≥ 0.5` + 25초. 그 이상은 한계                          |
| 몸만 찍던 사용자가 3분 넘게 얼굴을 보이다 물러남 | 25초 뒤 엎드림                              | 1단 기준선으로는 못 거른다. 2단 머리 아비터가 맡는다. 그 전까지 알려진 한계 |
| 몸만 찍던 사용자가 3분 미만 얼굴 노출 후 물러남  | 없음                                        | 기준선(3분/80%)이 거른다                                                    |
| 일시정지 없이 카메라를 몸통만 잡게 옮김          | 25초 뒤 엎드림(3분 이상 얼굴을 보였을 때만) | 기준선은 `stop()`마다 비운다. 도중 이동은 2단 아비터 몫                     |
| 옆 사람 얼굴 선택(`numFaces: 1`)                 | 놓침                                        | 다중 인물 AWAY 한계와 같은 부류                                             |
| 엎드림 + EfficientDet person 소실                | AWAY로 기록                                 | 검증 항목 6, 타이머는 맞다                                                  |
| 블렌드셰이프 이름 불일치                         | 눈 규칙이 알림 없이 죽음                    | Sentry 1회 + `face:skip` 진단                                               |

## 검증

- BY-700: `detection.test.ts` 기존 케이스 무수정 통과 + `NO_TRIGGER_SIGNALS` 키 = `DETECTION_SOURCES`, `SOURCE_TRIGGER` 값 집합 = `TRIGGER_PRIORITY`. `source` 이름 변경 테스트 편집.
- BY-701: `faceLandmarker.test.ts`(objectDetector.test 거울: delegate 폴백·재시도·동시 load·로딩 중 close·연속 실패 5회·정규화 4분기·`JSON.stringify(result)`에 `x`/`y`/`landmarks`/`matrix` 없음), `sleepRules.test.ts`(임계 경계·한쪽 눈·3표본 중앙값·`eye:null`·`face:null`·person 없음·`faceStable` 거짓·`headInFrame === false` 거부 각각 부정), `visionConfig` 정합성(`FACE_FRAME_DIVISOR × FRAME_INTERVAL_MS ≤ SLEEP_EYES.enterMs / 4`, `FACE_BASELINE_WINDOW_MS ≥ SLEEP_FACE.enterMs × 4`).
- BY-702: `detection.test.ts` "출처별 유지시간"(9,999ms 미확정/10,000ms 확정, 25,000ms, 해제 3초, 두 출처 → 단일 SLEEP, 한 출처 해제해도 유지, 동률 SLEEP+PHONE→SLEEP·DEVICE+SLEEP→DEVICE, 규칙 (a) PHONE 유지 후 hand-off → SLEEP), `sessionCopy`·`sessionResult`(SLEEP 행·`distractionSec` 포함·0건 생략)·`restoreActiveSession`("SLEEP 이벤트가 있어도 복원", `"NAPPING"` 거부 유지)·`recordsFormat`(`졸음 2회`, 순서)·`tokens`·`useStudyRoomSession.analytics`(`status: "SLEEP"`)·`RoomPage`(제출 `events[0].status === "SLEEP"`)·5키 `eventCounts` 픽스처 갱신.
- BY-703: `visionFocusDetector.test.ts`(SLEEP_EYES emit, 4번째 프레임에서만 얼굴 `detect` 호출, person 없으면 미실행, 얼굴 load는 객체 ready 뒤, 얼굴 unavailable이면 SLEEP 없음·AWAY/PHONE 유지, `stop()` 기준선 리셋, `close()` 둘 다 닫음, 진단 payload에 좌표 키 없음, DEVICE 절대 내지 않음 유지) + 기준선 링버퍼(버퍼 미충족 → 거짓 / 90개 중 72개 이상 → 참 / 30초·2분 노출 후 소실 → 엎드림 없음 / 5분 노출 후 소실 → 25초 뒤 엎드림 / 래치 / `stop()` 후 비움). `diagnostics.test.ts` 얼굴 필드 평탄화.

```bash
pnpm --filter web typecheck && pnpm --filter web lint
pnpm --filter web test -- src/features/study-session src/features/records src/features/home src/routes src/lib/__tests__/amplitude.test.ts
pnpm --filter @focusmakers/design-tokens test && pnpm --filter @focusmakers/types typecheck
pnpm typecheck && pnpm lint && pnpm test
```

BY-702에서 가드가 작동한다는 증거는 수정 전 `tsc` 실패 지점이다: `TRIGGER_PRIORITY_RANK`, `SOURCE_TRIGGER`, `DISTRACTION_ROW_ORDER`, `KNOWN_EVENT_STATUSES`, `DISTRACTION_COPY`, `EVENT_STATUS_LABEL`, `EVENT_SHORT_LABELS`, `EVENT_CHIP_ORDER_INDEX`, 타입 붙은 `eventCounts` 픽스처, `tokens.test.ts`.

E2E(BY-703 후): `pnpm --filter web dev` → `/room/...?diag=1`에서 콘솔 Verbose로 `face:ready` → 눈 감기 10초 → `vision:transition` FOCUS→DISTRACTION:SLEEP, 필 문구 "졸고 있는 것 같아요" → 눈 뜸 → 3초 내 복귀. `?detector=mock`으로 `emit({ source: "SLEEP_FACE", active: true })` 25초 후 전이. 결과 화면 S4에 "졸음 1회" 행.

## 스파이크 결과 (2026-09-20, 얼굴 모델)

독립 HTML 페이지(사람·휴대폰 int8 0.5초 + 얼굴 N=4, CPU, tasks-vision 1.0.0, face_landmarker float16 v1 sha256 `64184e22…9ff`)로 Mac Chrome과 iPhone 17(iOS 18.7 Safari, 전면 720×1280)에서 측정. 피험자 1명.

| 상황                   | 기기     | 얼굴 %    | 감김 min/mean/max               | 내려다봄 mean/max     | 눈 간격     | 사람                    |
| ---------------------- | -------- | --------- | ------------------------------- | --------------------- | ----------- | ----------------------- |
| 눈 뜸                  | Mac / 폰 | 100 / 100 | 0.14/0.22/0.52 · 0.13/0.18/0.22 | 0.34/0.57 · 0.37/0.46 | 0.13 / 0.16 | 0.97 / 0.83             |
| 눈 감음                | Mac / 폰 | 100 / 100 | 0.28/0.57/0.62 · 0.25/0.57/0.64 | 0.61/0.67 · 0.72/0.79 | 0.13 / 0.15 | 0.96 / 0.85             |
| 내려다봄(책)           | Mac / 폰 | 95 / 100  | 0.04/0.20/0.38 · 0.09/0.27/0.36 | 0.07/0.14 · 0.19/0.33 | 0.16 / 0.17 | 0.96 / 0.82             |
| 안경 감음              | Mac / 폰 | 100 / 100 | 0.60/0.63/0.65 · 0.42/0.53/0.68 | 0.70/0.74 · 0.70/0.72 | 0.12 / 0.15 | 0.90 / 0.83             |
| 엎드림                 | Mac / 폰 | 0 / 10    | 없음                            | 없음                  | 없음        | 0.52~~0.96 / 0.66~~0.77 |
| 몸통만(머리 프레임 밖) | Mac      | 0         | 없음                            | 없음                  | 없음        | 0.98                    |
| 약 1m 거리             | Mac      | 35        | 0.17                            | 0.22                  | 0.06        | 0.80                    |

| 기기             | 사람·휴대폰 ms avg/p95 | 얼굴 ms avg/p95 | 버려진 틱 | 시간 |
| ---------------- | ---------------------- | --------------- | --------- | ---- |
| Mac Chrome       | 125 / 126              | 52 / 55         | 0         | 20분 |
| iPhone 17 Safari | 148 / 151              | 44~54 / 55      | 0         | 10분 |

결론과 반영:

- 블렌드셰이프 52개, 랜드마크 478점, 눈 이름 4개 존재. 이름 목록 그대로.
- 감김 임계 0.65 → 0.45(3표본 중앙값). 감은 눈이 0.53~~0.57 평균, 최대 0.62~~0.68이라 0.65는 걸리지 않는다. 뜬 눈 평균 0.18~~0.24, 깜빡임 순간 최대 0.52~~0.57은 한 표본이라 중앙값이 거른다. 안경 감음 최소 0.42가 있어 여유가 얇으므로 BY-704에서 피험자를 늘려 재확정한다.
- 내려다봄 거부권 삭제. 눈을 감으면 `eyeLookDown*`가 오르고 책을 볼 때는 낮다.
- 눈 간격 최소 0.06 → 0.07. 0.06 근처는 얼굴 검출 자체가 흔들린다.
- 사람 게이트 0.5 유지. 폰 엎드림 0.66~0.77. Mac은 0.52까지 떨어져 앱 안에서 재확인.
- 얼굴 유무도 3표본 다수결. 엎드림 중 1~2표본 오검출이 있었다.
- 얼굴 추론 44~54ms. N=4에서 CPU +2.5%p, N=2여도 +5%p. E+F ≈ 200ms로 틱 안에 여유.
- 폰 사람·휴대폰 148ms는 BY-305의 앱 안 측정(213~371ms)보다 낮다. Safari와 앱 WebView의 부하 차이로 보이며 앱 안(BY-704)에서 다시 잰다. 얼굴 모델이 더하는 몫(F)은 그대로 쓴다.
- 프리뷰보다 모델이 넓게 본다. 폰에서 사용자가 "목만 보인다"고 판단한 배치에서 모델은 얼굴을 100% 잡았고 두 눈이 프레임 안에 있었다(얼굴 폭이 프레임의 30~35%). 페이지 미리보기가 세로 프레임을 잘라 보여준 탓이고, 앱 프리뷰도 `object-fit: cover`로 원본을 잘라내므로 같은 일이 생긴다. 몸만 찍는다고 생각하는 사용자 일부는 실제로는 얼굴이 잡혀 눈 감김 규칙이 동작한다. 진짜 머리가 프레임 밖인 배치(Mac 측정)에서는 얼굴 0%이고 몸통을 얼굴로 착각하지 않는다.

## 이 문서가 확정하지 않은 것

| 항목                                                                                         | 처리                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------ |
| `SLEEP_EYES`·`SLEEP_FACE` 유지시간, `eyeClosure`(피험자 1명 기준 0.45), `FACE_FRAME_DIVISOR` | BY-704 앱 안에서 재확정(피험자 추가) |
| 엎드림 규칙 유지 여부                                                                        | BY-704 항목 5·6·9 결과로 결정        |
| 머리 아비터 도입                                                                             | BY-704 항목 10 통과 시 BY-705        |
| 화면 문구                                                                                    | 리더 확인                            |
| Swagger의 `SLEEP` 리터럴                                                                     | BY-706 등재 후 grep 대조             |
| 개인정보처리방침 문구                                                                        | 리더/법무 소유자                     |
