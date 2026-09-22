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
| 졸음 정의         | 두 규칙, 사용자에게는 하나의 "졸음". (a) 눈 감김 지속: 얼굴 검출 + 양쪽 눈 감김 점수가 그 사람의 임계 이상으로 10초 유지. (b) 꾸벅거림: 최근 44초 중 감긴 표본이 절반 이상. 엎드림(얼굴 소실) 규칙은 2026-09-20에 코드에서 지웠다(아래 "엎드림 규칙을 지운다" 절)                                                                           |
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
| `vision/sleepRules.ts`                                                           | 순수 규칙. `SleepFrame { personPresent, faceSamples, eyeClosureThreshold, eyeReadings }` → `SleepSignals { eyesClosed, eyesDrowsy }`. `SleepRule` 인터페이스로 교체 가능                                                                                                                                     |
| `vision/__tests__/faceLandmarker.test.ts`, `vision/__tests__/sleepRules.test.ts` | fake 런타임·픽스처만으로 도는 테스트                                                                                                                                                                                                                                                                         |
| `public/models/face_landmarker.task`                                             | float16 v1 ≈3.7MB, 커밋. 출처 URL·sha256은 `visionConfig.ts`의 `FACE_MODEL_PATH` docblock에 기록                                                                                                                                                                                                             |

### 정규화 결과. 좌표는 이 경계를 넘지 않는다

```ts
export interface FaceObservation {
  readonly facePresent: boolean; // 품질 무관. 판정에는 안 쓰고 진단·측정 패널이 본다
  readonly eye: Readonly<Record<EyeBlendshapeName, number>> | null; // 품질 게이트 통과 시만. null = 이번 프레임 눈 판정 없음
  readonly eyeSkipReason: "no-face" | "face-too-small" | "blendshapes-missing" | null;
}
```

`normalize()` 순서: 얼굴 없음 → `no-face` / 눈 바깥꼬리 랜드마크(33·263) 정규화 간격 < `MIN_INTER_OCULAR_NORMALIZED` → `face-too-small`(거리값은 저장·반환·로그하지 않음) / 블렌드셰이프 이름 누락 → `blendshapes-missing` + Sentry 1회 / 통과 → 스칼라 4개. FaceLandmarker 결과에는 얼굴별 신뢰도가 없으므로(`vision.d.ts` `FaceLandmarkerResult`) 신뢰도 게이트는 생성 옵션 0.6으로만 건다.

### 규칙 `defaultSleepRule`

- `eyesClosed` = person 있음 ∧ `eye !== null` ∧ 최근 2표본이 모두 `min(eyeBlinkLeft, eyeBlinkRight) ≥ 임계`(처음 설계는 3표본 중앙값이었고, 2026-09-20 실측 뒤 둘로 줄였다. 아래 실측 절). 내려다봄 거부권은 두지 않는다. 스파이크에서 눈을 감으면 `eyeLookDown*`가 0.6~~0.8로 오르고 책을 볼 때는 0.07~~0.33이라, 거부권은 진짜 졸음을 막는 쪽으로만 동작했다. 책을 볼 때 감김 점수 최대는 0.36~0.38이라 거부권 없이도 오탐이 없다. 중앙값을 쓰는 이유는 깜빡임 한 표본(최대 0.57)이 10초 유지시간을 초기화하거나 진입시키지 않게 하기 위해서다.
- 얼굴 소실(엎드림) 규칙과 그 기준선·2단 머리 아비터 주입점은 2026-09-20에 지웠다. 근거는 아래 "엎드림 규칙을 지운다" 절.
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
export const FACE_SMOOTHING_SAMPLES = 2; // 눈 감김을 다듬는 창. 처음 3, 실측 뒤 2
```

`mediapipeModule.ts`의 `createFaceLandmarker`는 `runningMode: "VIDEO"`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: false` 고정이다(비용이고 자세 행렬은 위치 정보다). delegate는 `DELEGATE_ORDER`(CPU)를 재사용한다.

### 스케줄링과 발열 예산

- 얼굴 추론은 같은 `onFrame` 안에서 EfficientDet 뒤에, `frameIndex % FACE_FRAME_DIVISOR === 0` ∧ `personPresent` ∧ 얼굴 래퍼 `ready`일 때만 돈다.
- 얼굴 모델 `load()`는 객체 검출기가 `ready`가 된 뒤에 건다(`ensureLoaded().then`). 첫 호출 프리즈(S3 8~15초)가 겹치지 않고 AWAY/PHONE 첫 판정 시각이 바뀌지 않는다.
- 산술: 추가 듀티 = F / (N × 500ms). N=4에서 +5%p ⇔ F ≤ 100ms, N=6 ⇔ 150ms, N=8 ⇔ 200ms. `E + F > 500ms`면 다음 틱이 버려져 2.5초마다 1초 공백이 생기므로 "버림 0"이 합격 기준이다.
- 기각한 대안: 매 틱 실행(BY-305 포화 재현), 틱 교대(PHONE 1Hz, `visionConfig.ts`의 1000ms 기각 사유 그대로), 워커(기존 스펙 §12의 별도 티켓, N이 충분하면 불필요).

### `adapters/focusDetector.ts` 연결

- `DetectorSignal`은 `{ source: DetectionSource, active }`로 바뀐다(설계 B). `VISION_SOURCES = ["AWAY","PHONE","SLEEP_EYES","SLEEP_DROWSY"]`, `emitted: Record<VisionSource, boolean> | null`. 첫 publish는 전부 내보내서(`SLEEP_* = false` 포함) 일시정지 전 훅에 남은 오래된 `true`를 덮는다(`deviceHandlingDetector.ts`가 의존하는 성질).
- 새 옵션: `faceLandmarker?`(테스트 주입), `sleepRule?`, `sleepDetection?: boolean`(기본 `true`. DEV 또는 `?diag=1`에서만 `?sleep=0`으로 끈다. 실기기 A/B용이며 `resolveModelVariant` 패턴). 새 공개면: `faceStatus`, `subscribeFaceStatus`. 기존 `status`는 객체 검출기 의미를 유지한다.
- 상태: `faceSamples`(최근 얼굴 관측, `!personPresent`면 비움), `calibrationReadings`·`calibration`(눈 보정), `eyeReadings`(비율 창), `frameIndex`.
- 얼굴 `unavailable` + 객체 `ready`: SLEEP 출처는 영원히 false, AWAY/PHONE 무영향. 객체 `unavailable`: 루프가 이미 멈춰 얼굴 로드 자체를 걸지 않는다. `close()`는 둘 다 닫는다.
- `DevVisionFailureNotice.tsx`: 얼굴 실패 줄 추가(`data-dev-notice="face-unavailable"`, `subscribeFaceStatus`). `RoomPage.tsx`·`LiveRoomSession.tsx`는 둘 다 `createVisionFocusDetector({ video })`를 쓰므로 소셜룸도 자동 적용된다.
- 주석 갱신: `focusDetector.ts`의 "Vision은 AWAY/PHONE만" 서술과 `frameLoop.ts`의 같은 서술을 "Vision은 AWAY/PHONE/SLEEP_EYES/SLEEP_DROWSY, 가속도는 DEVICE"로 바꾼다.

### 진단(`vision/diagnostics.ts`, 스칼라만)

`sleepEyesSignal`, `sleepFaceSignal`, `faceBaseline`, 얼굴 틱에서만 `face:ran/present/eyeBlinkLeft…/skip/durationMs/delegate`(null 키는 생략). 새 이벤트 `face:ready`, `face:unavailable`. 기존 스펙 §8 표에 추가한다.

| 남긴다                                 | 남기지 않는다                                      |
| -------------------------------------- | -------------------------------------------------- |
| 얼굴 유무 (boolean)                    | 얼굴 랜드마크 좌표 478점 전부                      |
| 눈 blendshape 4종 점수(소수 둘째 자리) | 나머지 blendshape 48종(표정 벡터)                  |
| 눈 판정 생략 사유(문자열 enum)         | 눈 간격 등 크기·거리 스칼라(bbox 크기와 같은 성격) |
| 졸음 원신호 2종                        | 얼굴 변환 행렬(생성 자체를 끈다)                   |
| 얼굴 추론 소요시간 · delegate          |                                                    |

### 라이선스와 자산

- `features/settings/openSourceLicenses.ts`에 "MediaPipe Face Landmarker" 항목을 추가한다(Apache-2.0, Copyright Google LLC, role은 졸음 감지·온디바이스 명시). EfficientDet `role`에 drowsiness를 더하고 헤더의 "세 항목"을 "네 항목"으로 바꾼다. `settingsSubPages.test.tsx`는 항목을 순회하므로 무변경이다.
- `scripts/copyMediapipeWasm.js`와 `.gitignore` 주석에 `.task`도 커밋 대상임을 추가한다. `docs/handoff/2026-08-01-by-332-…md` 표에 `curl -I <url>/models/face_landmarker.task` 행을 추가한다(`text/html`이면 안 된다).

## 설계 B. 세션 모델·명세·UI

### `detection.ts`. 출처 계층 도입(디바운서는 하나)

트리거(사용자·서버 단위) 아래에 원신호 출처 계층을 둔다. AWAY·PHONE·DEVICE는 출처가 하나라 이름이 같고 동작이 바이트 단위로 동일하다. SLEEP만 출처가 둘이다.

```ts
export const DETECTION_SOURCES = ["AWAY", "PHONE", "DEVICE", "SLEEP_EYES", "SLEEP_DROWSY"] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];
export const SOURCE_TRIGGER = { AWAY: "AWAY", PHONE: "PHONE", DEVICE: "DEVICE", SLEEP_EYES: "SLEEP", SLEEP_DROWSY: "SLEEP" }
  as const satisfies Record<DetectionSource, DistractionTrigger>;
export type DetectionParams = Record<DetectionSource, TriggerHoldParams>;
export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  AWAY: { enterMs: 1500, exitMs: 2000 }, PHONE: { enterMs: 500, exitMs: 1500 }, DEVICE: { enterMs: 500, exitMs: 2000 },
  SLEEP_EYES: { enterMs: 10_000, exitMs: 2000 },   // 잠정. 해제는 실측 뒤 3000에서 2000으로
  SLEEP_DROWSY: { enterMs: 4000, exitMs: 2000 },   // 원신호가 이미 44초 비율로 평활돼 있어 진입이 짧다
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

- `sessionCopy.ts`: `SLEEP: { label: "졸고 있는 것 같아요", subLabel: "깨어나면 자동으로 다시 측정돼요" }`. 오래 감김·꾸벅거림을 한 문구로 덮고 추정형 어미를 유지한다. 대안은 subLabel "다시 집중하면 자동으로 다시 측정돼요"다.
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
| BY-703 Vision 연결       | `focusDetector.ts`(얼굴 틱·publish 4출처. 당시의 기준선 링버퍼·래치는 2026-09-20에 지웠다) · `DevVisionFailureNotice` · `?sleep=0` DEV 오버라이드 · 어댑터 테스트                     | BY-700 + BY-701 + BY-702             |
| BY-704 실기기 검증       | 아래 체크리스트, 결과를 기존 스펙 §10 형식으로 기록, 상수 확정                                                                                                                        | BY-703 dev 배포본 + `?diag=1`        |
| BY-705 머리 아비터(후속) | PoseLandmarker 래퍼 · `HeadPresenceRule` 구현 · 후보 구간 한정 실행 · 테스트 · 라이선스 항목                                                                                          | BY-704 항목 9~10 통과                |

#### BY-703에서 설계와 다르게 간 것

- 얼굴 래퍼가 런타임에 감지 불가로 내려가는 경로를 어댑터가 직접 본다. `load()` 결과만 보면 그 전이를 놓쳐 얼어붙은 관측이 졸음 판정을 세션 끝까지 고정한다. 판정에 쓰는 관측은 새 관측이 있는 틱으로 한정했다.
- `?sleep=0`은 DEV 전용이 아니라 진단(`?diag=1`)이 켜진 프로덕션 번들에서도 듣는다. 앱에 들어가는 웹은 언제나 프로덕션 빌드라, DEV 전용이면 정작 발열 A/B를 재야 할 환경에서 쓸 수 없다.

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

2026-09-20 갱신: 엎드림 규칙을 코드에서 지우면서(아래 "엎드림 규칙을 지운다" 절) 5·6·9·10항은 잴 대상이 없어졌고, 4항의 저조도도 측정에서 뺐다. 남긴 반대 검증은 몸만 찍히는 구간이고, 여기서 졸음이 한 번이라도 나오면 안 된다. 측정은 이제 시간표가 아니라 패널의 행동 버튼으로 구간을 열어 진행한다.

### 임계값으로 못 푸는 잔여 실패 모드

| 모드                             | 효과                     | 처리                                                       |
| -------------------------------- | ------------------------ | ---------------------------------------------------------- |
| 선글라스·색안경                  | 눈 감김 오판 가능        | 개인별 임계 + 10초로 완화. 알려진 한계, 추정형 문구 유지   |
| 앞머리·손으로 눈 가림            | 같음                     | 손은 보통 유지시간보다 짧다. 알려진 한계                   |
| 세션 중 조명 끔                  | 얼굴 소실                | 눈 표본이 빠질 뿐 졸음은 서지 않는다. 그동안의 잠은 놓친다 |
| 책상에 엎드려 잠                 | 얼굴 소실, 졸음 없음     | 2026-09-20에 엎드림 규칙을 지웠다. 알려진 한계             |
| 옆 사람 얼굴 선택(`numFaces: 1`) | 놓침                     | 다중 인물 AWAY 한계와 같은 부류                            |
| 블렌드셰이프 이름 불일치         | 눈 규칙이 알림 없이 죽음 | Sentry 1회 + `face:skip` 진단                              |

## 검증

- BY-700: `detection.test.ts` 기존 케이스 무수정 통과 + `NO_TRIGGER_SIGNALS` 키 = `DETECTION_SOURCES`, `SOURCE_TRIGGER` 값 집합 = `TRIGGER_PRIORITY`. `source` 이름 변경 테스트 편집.
- BY-701: `faceLandmarker.test.ts`(objectDetector.test 거울: delegate 폴백·재시도·동시 load·로딩 중 close·연속 실패 5회·정규화 4분기·`JSON.stringify(result)`에 `x`/`y`/`landmarks`/`matrix` 없음), `sleepRules.test.ts`(임계 경계·한쪽 눈·3표본 중앙값·`eye:null`·`face:null`·person 없음·`faceStable` 거짓·`headInFrame === false` 거부 각각 부정), `visionConfig` 정합성(`FACE_FRAME_DIVISOR × FRAME_INTERVAL_MS ≤ SLEEP_EYES.enterMs / 4`, `FACE_BASELINE_WINDOW_MS ≥ SLEEP_FACE.enterMs × 4`).
- BY-702: `detection.test.ts` "출처별 유지시간"(9,999ms 미확정/10,000ms 확정, 25,000ms, 해제 3초, 두 출처 → 단일 SLEEP, 한 출처 해제해도 유지, 동률 SLEEP+PHONE→SLEEP·DEVICE+SLEEP→DEVICE, 규칙 (a) PHONE 유지 후 hand-off → SLEEP), `sessionCopy`·`sessionResult`(SLEEP 행·`distractionSec` 포함·0건 생략)·`restoreActiveSession`("SLEEP 이벤트가 있어도 복원", `"NAPPING"` 거부 유지)·`recordsFormat`(`졸음 2회`, 순서)·`tokens`·`useStudyRoomSession.analytics`(`status: "SLEEP"`)·`RoomPage`(제출 `events[0].status === "SLEEP"`)·5키 `eventCounts` 픽스처 갱신.
- BY-703: `visionFocusDetector.test.ts`(SLEEP_EYES emit, 4번째 프레임에서만 얼굴 `detect` 호출, person 없으면 미실행, 얼굴 load는 객체 ready 뒤, 얼굴 unavailable이면 SLEEP 없음·AWAY/PHONE 유지, `stop()` 관측 리셋, `close()` 둘 다 닫음, 진단 payload에 좌표 키 없음, DEVICE 절대 내지 않음 유지) (당시의 기준선 링버퍼 케이스들은 2026-09-20 규칙 삭제와 함께 지웠다). `diagnostics.test.ts` 얼굴 필드 평탄화.

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
- 감김 임계 0.65 → 0.45(당시 3표본 중앙값). 감은 눈이 0.53~~0.57 평균, 최대 0.62~~0.68이라 0.65는 걸리지 않는다. 뜬 눈 평균 0.18~~0.24, 깜빡임 순간 최대 0.52~~0.57은 한 표본이라 중앙값이 거른다. 안경 감음 최소 0.42가 있어 여유가 얇으므로 BY-704에서 피험자를 늘려 재확정한다.
- 내려다봄 거부권 삭제. 눈을 감으면 `eyeLookDown*`가 오르고 책을 볼 때는 낮다.
- 눈 간격 최소 0.06 → 0.07. 0.06 근처는 얼굴 검출 자체가 흔들린다.
- 사람 게이트 0.5 유지. 폰 엎드림 0.66~0.77. Mac은 0.52까지 떨어져 앱 안에서 재확인.
- 얼굴 유무도 당시 3표본 다수결. 엎드림 중 1~2표본 오검출이 있었다.
- 얼굴 추론 44~54ms. N=4에서 CPU +2.5%p, N=2여도 +5%p. E+F ≈ 200ms로 틱 안에 여유.
- 폰 사람·휴대폰 148ms는 BY-305의 앱 안 측정(213~371ms)보다 낮다. Safari와 앱 WebView의 부하 차이로 보이며 앱 안(BY-704)에서 다시 잰다. 얼굴 모델이 더하는 몫(F)은 그대로 쓴다.
- 프리뷰보다 모델이 넓게 본다. 폰에서 사용자가 "목만 보인다"고 판단한 배치에서 모델은 얼굴을 100% 잡았고 두 눈이 프레임 안에 있었다(얼굴 폭이 프레임의 30~35%). 페이지 미리보기가 세로 프레임을 잘라 보여준 탓이고, 앱 프리뷰도 `object-fit: cover`로 원본을 잘라내므로 같은 일이 생긴다. 몸만 찍는다고 생각하는 사용자 일부는 실제로는 얼굴이 잡혀 눈 감김 규칙이 동작한다. 진짜 머리가 프레임 밖인 배치(Mac 측정)에서는 얼굴 0%이고 몸통을 얼굴로 착각하지 않는다.

## 이 문서가 확정하지 않은 것

| 항목                                                                                           | 처리                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SLEEP_EYES`·`SLEEP_DROWSY` 유지시간, `eyeClosure`(피험자 1명 기준 0.45), `FACE_FRAME_DIVISOR` | BY-704 앱 안에서 재확정(피험자 추가)                                         |
| 엎드림 규칙 유지 여부                                                                          | 2026-09-20에 코드에서 지웠다(아래 절). 다시 넣으려면 머리 아비터(BY-705)부터 |
| 머리 아비터 도입                                                                               | BY-704 항목 10 통과 시 BY-705                                                |
| 화면 문구                                                                                      | 리더 확인                                                                    |
| Swagger의 `SLEEP` 리터럴                                                                       | BY-706 등재 후 grep 대조                                                     |
| 개인정보처리방침 문구                                                                          | 리더/법무 소유자                                                             |

### 엎드림 규칙을 지운다 (2026-09-20)

리허설에서 카메라를 낮게 두어 몸통만 찍은 세션이 기준선 3분을 채운 뒤 얼굴이 계속 안 보인다는 이유로 세션 끝까지 졸음으로 남았다. 지금 모델은 person 유무와 얼굴 유무만 보므로 책상에 엎드려 자는 사람과 카메라를 내려 몸통만 찍는 사람을 구분하지 못했다. 깨어 있는데 졸음으로 잡는 경우를 0으로 두려는 정밀도 우선 원칙(최우선 제약 2) 앞에서 이 구분 불가는 그대로 둘 수 없는 결함이라, 처음에는 `SLEEP_FACE` 원신호를 상수로 껐다가 같은 날 코드에서 통째로 지웠다. 지운 것은 `SLEEP_FACE` 출처와 유지시간, `faceLost` 신호와 기준선(`faceStable`, 3분/80% 링버퍼, 래치), 머리 아비터 주입점(`headInFrame`), 측정 도구의 리허설 표시(`?rehearsal=1`)다. 얼굴 유무(`facePresent`)는 진단과 측정 패널이 보는 값이라 남겼다. 책상에 엎드려 자는 시간을 놓치는 대가는 감수한 것이고, 다시 넣으려면 머리가 프레임 안에 있는지와 몸통만 찍혔는지를 구분하는 모델(BY-705)이 먼저 있어야 한다. 지운 코드는 git 이력에 있다.

### BY-709: 눈 감김 판정을 강화한다

엎드림을 끄고 나니 졸음을 잡는 수단이 눈 감김 하나만 남았다. 그 하나로 확실하게 잡으려면 두 곳을 손봐야 했다. 사람마다 다른 뜬 눈 기준과, 연속으로는 걸리지 않는 꾸벅거림이다.

#### 왜 사람마다 맞추는가

블렌드셰이프 감김 점수는 사람의 눈 모양에 따라 기준선이 다르다. 눈이 작은 사람은 뜨고 있어도 점수가 높아 고정 임계 0.45를 깜빡임 한 번으로 넘길 수 있고, 눈이 큰 사람은 감아도 점수가 낮아 넘지 못한다. 고정 임계 하나는 어느 쪽으로 정해도 한쪽 사람을 가린다. 그래서 세션이 시작되면 그 사람의 뜬 눈이 실제로 몇 점인지를 먼저 재고(`EYE_CALIBRATION_SAMPLES` = 얼굴 틱 15회 = 30초), 거기서 `EYE_CALIBRATION_DELTA`만큼 위를 감김으로 본다.

문헌의 개인화는 사용자에게 "눈을 뜬 채 5초 버티세요"를 시킨 뒤 평균을 쓴다. 우리는 아무것도 시키지 않고 공부하는 동안 지나가며 재므로 두 가지가 달라진다. 창이 더 길고(30초), 평균이 아니라 낮은 쪽 백분위(`EYE_CALIBRATION_PERCENTILE` = 0.4)를 쓴다. 보정 중의 깜빡임과 잠깐의 감김은 점수가 높은 쪽에 몰리므로, 낮은 쪽을 보면 그 오염이 기준을 밀어 올리지 못한다. 백분위를 0.2가 아니라 0.4로 둔 것은 **창 사이의 최솟값이 그 오염을 이미 거르기 때문이다** — 낮은 백분위는 표본 셋만 낮게 읽혀도 기준이 내려가고 최솟값이 그것을 세션 끝까지 붙드는 약점이 된다. 고개를 잠깐 젖혀 천장을 보는 것(A19)만으로 그 사람의 기준이 영구히 무너진다. 0.4면 30초 중 12초가 낮아야 움직인다. 같은 이유로 **보정된 임계가 내려가면 비율 창을 비운다** — 창은 원표본을 들고 있어서, 임계가 내려가면 옛 표본이 통째로 감김으로 다시 채점되어 새 관측 하나 없이 판정이 뒤집힌다. 깨어 있는데 졸음으로 잡는 방향을 막는 쪽이다. 보정된 임계는 `EYE_THRESHOLD_MIN`~`EYE_THRESHOLD_MAX`에 가둔다 — 하한이 고정 임계와 같아 보정은 임계를 올리기만 한다(아래 절).

보정은 **한 번 재고 잠그지 않는다.** 창이 찰 때마다 기준값을 다시 재고, 지금까지 본 기준값 중 가장 낮은 값을 쓴다. 창이 찰 때마다 표본을 비우고 다시 모아 세션 내내 돈다. 기준값이 내려가기만 하는 것은 방향 때문이다 — 올라갈 수 있게 두면 조는 동안의 높은 점수가 기준을 밀어 올려, 자고 있을수록 임계가 올라가는 쪽으로 돈다. 첫 창이 찰 때까지는 **상한 0.65**를 임계로 쓴다(아래 절).

#### 왜 비율 판정을 따로 두는가

꾸벅거리는 사람은 한 번에 3초쯤 감았다 뜨기를 반복해 `SLEEP_EYES`의 연속 10초를 영영 못 채운다. 사이사이 뜬 눈이 유지시간을 계속 0으로 되돌리기 때문이다. 같은 1분을 합쳐서 보면 절반 넘게 감겨 있으므로, 연속이 아니라 비율로 한 번 더 본다. 이것이 PERCLOS이고, 1994년 정의부터 1분 창이 표준이다. 우리는 실측 뒤 44초로 줄였다(아래 실측 절). 새 원신호 `SLEEP_DROWSY`로 나가 기존 유지시간 모듈이 받는다.

비율은 연속 규칙과 달리 **원표본을 그대로 센다** — PERCLOS가 "눈이 감겨 있던 시간의 비율"로 정의되므로 평활을 먼저 씌우면 재려던 시간이 뭉개진다. 대가는 깜빡임 한 표본도 감김으로 세어져 비율이 조금씩 부푸는 것이고, 그것을 감당하는 것이 창 길이와 문턱이다.

창에는 나이 제한이 없다. 새 표본이 안 들어오면 마지막 1분이 그대로 얼어 판정이 고정되므로, 얼굴 틱이 돌았는데 눈 판정이 `EYE_AWAKE_CLEAR_SAMPLES`(3)만큼 연속으로 걸러지면 창을 버린다. 뜬 눈이 같은 수만큼 이어져도 창을 버리는데, 그만큼 눈을 못 봤거나 뜬 눈을 봤으면 창에 남은 것은 지금을 설명하지 못하는 과거라는 근거가 같다.

창이 다 차기 전에는 판정하지 않는다. 표본이 셋뿐일 때 둘이 감겨 있으면 비율이 0.67이 되어 깜빡임 두 번으로 졸음이 선다. 문턱은 0.5다 — 검증된 졸음 문턱 0.15는 주의력 검사 실패와 상관이 높은 피로 수준이지 잠이 아니고, 우리가 잡으려는 것은 잠이다. 3초 감고 1초 뜨는 꾸벅거림은 0.75라 잡히고, 책을 보며 눈꺼풀이 무거운 정도는 보정된 임계 아래라 애초에 세어지지 않는다.

대가는 꼬리였다. 깨어난 뒤 비율이 절반 아래로 내려오기까지 약 30초가 걸렸고, 실측에서는 63초까지 졸음에 머문 구간이 나와 뜬 눈 3표본이면 창을 비우게 바꿨다. 유지시간 진입을 4초로 짧게 둔 것은 원신호가 이미 1분 창으로 평활돼 있어 여기서 또 오래 기다리면 판정이 그만큼 늦기 때문이다.

#### 새 상수(전부 잠정, 실기기 재확정 대상)

| 상수                         | 값                 | 근거                                                                                                                                                                |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EYE_CALIBRATION_SAMPLES`    | 15                 | 문헌 참고 + 판단. 문헌은 지시 후 5초, 우리는 지시하지 않으므로 30초                                                                                                 |
| `EYE_CALIBRATION_PERCENTILE` | 0.4                | 판단. 문헌이 아니라 최솟값 설계와 짝이다. 창 사이 최솟값이 감김 오염을 거르므로 창 안에서까지 낮게 볼 이유가 없고, 낮으면 표본 셋짜리 잡음에 기준이 영구히 무너진다 |
| `EYE_CALIBRATION_DELTA`      | 0.25               | 스파이크. 문헌의 75% 비율을 블렌드셰이프의 간격으로 옮긴 값. 스파이크 피험자에게 고정 임계 0.45가 그대로 나온다                                                     |
| `EYE_RATIO_WINDOW_SAMPLES`   | 22                 | 문헌은 1분. 실측 뒤 44초 = 얼굴 틱 2초 × 22                                                                                                                         |
| `EYE_RATIO_THRESHOLD`        | 0.5                | 문헌 + 판단. 0.15는 피로이지 잠이 아니다. 0.7이 더 보수적인 대안                                                                                                    |
| `SLEEP_DROWSY` 유지시간      | 진입 4초, 해제 2초 | 판단. 원신호가 이미 평활돼 있다. 해제는 다른 졸음 출처와 같다                                                                                                       |

기존 `SLEEP_EYES` 연속 10초는 그대로 둔다. 마이크로슬립 정의가 1~~15초라 10초는 그 구간의 위쪽이고, 정상 깜빡임 0.1~~0.4초와 피로 징후 1초보다 한참 보수적이다. 실기기에서 5초로 내릴 여지를 본다.

근거 문헌: PERCLOS 정의와 1분 창·0.15 문턱(Wierwille 1994, Dinges 1998과 후속 검증), 마이크로슬립 1~15초, 개인별 보정 5초·기준의 75%·눈 작은 사람 오탐 감소, 블렌드셰이프 0=뜸 1=감김(MediaPipe 문서).

#### 보정은 세션 내내 계속 배운다

보정을 지나가며 재는 방식에는 절벽이 하나 있다. 앉자마자 자는 사람은 첫 30초의 표본이 전부 감김이라, 그 값이 그대로 "이 사람의 뜬 눈" 기준이 된다. 감김 0.6이 기준으로 잡히면 임계가 0.85로 잠기고, **그 뒤로 이 사람의 감김은 세션이 끝날 때까지 한 번도 안 잡힌다.** 엎드림 규칙을 지운 지금 졸음을 잡는 수단은 눈뿐이므로 이것은 세션 하나를 통째로 잃는 것이고, 낮은 쪽 백분위로도 막히지 않는다 — 표본 전체가 오염됐을 때는 어느 분위수를 골라도 감김이다.

**한 번 재고 잠그지 않는 것으로 푼다.** 창이 찰 때마다 표본을 비우고 다시 모아 기준값을 재고, 지금까지 본 것 중 가장 낮은 기준값이 살아남는다. 처음부터 자던 사람은 첫 창에서 기준이 높게 잡히지만 깨어난 뒤 다음 창에서 낮은 값이 나와 기준이 스스로 내려온다. 30초 안에 회복된다.

⚠️ **한때 "기준값이 고정 임계 이상이면 그 보정을 거부한다"로 갔다가 되돌렸다. 다시 시도하지 말 것.** 거부 기준이 고정 임계라는 것이 순환이었다. 눈이 작아 뜬 눈이 원래 0.45 이상인 사람은 보정이 **영영** 거부돼 고정 임계로 돌아가고, 뜨고 있어도 세션 내내 졸음으로 찍힌다. 뜬 눈 0.45·0.50·0.55에서 재현했다. 이 티켓이 고치겠다고 한 바로 그 사람이라, 거부는 절벽 하나를 막고 더 큰 절벽을 만든 셈이었다. 계속 배우는 방식은 그 사람을 거부하지 않고 자기 값으로 보정한다 — 뜬 눈이 0.5면 임계는 0.75다.

#### 첫 창이 차기 전에는 판정을 쉰다

하한을 고정 임계로 두던 때 고정 임계 0.45는 이 시스템이 낼 수 있는 **가장 공격적인** 값이었다. 보정 전에 그 값을 쓰면 뜬 눈이 0.45~0.55인 사람이 3.5초에 원신호, 13.5초에 졸음 확정, 29.5초에 첫 보정 창이 차면서 해제 — **매 세션 시작 19초가 졸음으로 기록된다.** 아직 이 사람에 대해 아무것도 모르는 구간에서 가장 공격적으로 판정하는 셈이고, 비율 규칙이 "창이 안 차면 판정하지 않는다"를 지키는 것과도 어긋난다.

처음에는 이 구간에 상한 0.65를 임계로 썼다. 그런데 뜬 눈이 0.65를 넘는 사람이 있으면 그 사람은 세션 시작 10초 만에 졸음으로 찍히고, 그런 사람이 없다는 근거는 피험자 둘뿐이었다. 그래서 첫 창이 차기 전에는 임계를 아예 두지 않고(`eyeClosureThreshold: null`) 규칙이 눈 판정을 쉰다. 비율 창도 이 동안은 쌓지 않는다. 대가는 세션 시작 30초 안에 잠드는 사람을 놓치는 것인데, 세션이 막 시작된 구간이라 방향이 맞다.

#### 상한을 두지 않는다

임계는 뜬 눈 기준값 + 0.25다. 처음에는 0.65 상한이 있었다. 감은 눈이 누구나 0.5~~0.7에서 멈춘다는 가정 위에서, 뜬 눈이 높은 사람의 감김이 임계 밑에 깔리지 않게 하려던 것이다. 그런데 뜬 눈이 0.5로 읽히는 사람이 감았을 때 0.8~~0.9까지 간다면 상한은 반대로 작용한다. 임계 0.65와 뜬 눈 0.5의 간격이 0.15뿐이라 흔들리는 순간 깨어 있는데 졸음으로 찍힌다. 상한이 없으면 감은 눈이 임계에 못 미치는 사람을 놓칠 수는 있어도 깨어 있는 사람을 졸음으로 잡는 쪽으로는 틀리지 않으므로, 상한을 지웠다. 뜬 눈이 높은 사람의 감은 눈이 실제로 얼마인지는 실기기 데이터로 확인한다.

#### 하한도 두지 않는다 (2026-09-20)

처음에는 하한을 고정 임계 0.45로 뒀다. 눈이 커서 감아도 0.45에 못 미치는 사람을 놓치는 대신, 책을 내려다볼 때 뜬 눈 점수가 오르는 자세를 오탐에서 지키려던 것이다. 실측에서 그 자세의 뜬 눈 상위 5%가 0.41이었고 하한 없이 계산한 임계는 0.34라, 하한이 실제로 막고 있던 것이 이 오탐이었다.

그럼에도 하한을 뺐다. 눈이 큰 사람(뜬 눈 0.001, 감은 눈 0.3)은 하한이 있으면 영영 못 잡히는데, 그런 사람이 있는지 없는지 하한을 둔 채로는 확인조차 되지 않기 때문이다. 이제 임계는 언제나 뜬 눈 기준값 + 0.25다. 받아들인 위험은 공부 중 오탐이고, 실측에서 그 오탐이 나오면 `EYE_CALIBRATION_DELTA`를 올리거나 하한을 되살린다. 옛 상수 `SLEEP_THRESHOLDS`와 `EYE_THRESHOLD_MIN`은 지웠다.

#### 고개 기울기를 이번에 넣지 않은 이유

고개가 떨어지는 것은 졸음의 또 다른 신호지만, 자세 추정을 한 벌 더 돌리는 비용을 아직 재지 않았다. 얼굴 자세 행렬은 위치 정보라 그대로 쓸 수 없고, 별도 모델은 발열 예산을 다시 계산해야 한다. 눈 감김만으로 어디까지 잡히는지를 실기기에서 먼저 본 뒤 정한다. A18이 고개를 함께 떨어뜨리게 한 것은 그 구간에서 눈 신호만으로 잡히는지를 확인하기 위해서다.

#### 비율 판정이 치르는 두 대가

**창이 개수 기반이라 44초는 벽시계 44초가 아니다.** 표본 22개를 세는 것이라, 프레임이 버려지거나 얼굴 틱이 건너뛰어지면 그 22개가 덮는 실제 시간이 44초보다 길어진다. 발열로 추론이 느려질수록 창이 조용히 늘어나고, 그만큼 판정이 늦고 깨어난 뒤 꼬리도 길어진다. 실기기에서 `dropped`와 함께 본다.

**창을 버리면 다시 서기까지 22개가 새로 필요하다.** 자리 이탈·일시정지·얼굴 모델 사망·눈 판정 연속 누락·뜬 눈 연속·임계 하락에서 창을 버리는데, 그 뒤 `SLEEP_DROWSY`가 다시 서려면 깨끗한 표본 22개, 즉 44초가 또 걸린다. 자리를 자주 비우는 사람에게는 비율 판정이 사실상 안 도는 구간이 생긴다. 오탐을 막는 쪽으로 택한 대가이고, 연속 규칙(`SLEEP_EYES`)은 그 구간에서도 계속 돈다.

#### 2026-09-20 실기기 실측으로 바꾼 것

아이폰 11, Safari, 시나리오 13개를 한 세션으로 돌렸다. 성능은 객체 추론 p95 153ms, 얼굴 추론 p95 24ms로 합이 500ms 기준에 한참 못 미쳤고 버린 틱은 0이었다. 판정에서는 넷이 보였다.

- A1 눈 감김이 안 잡혔다. 준비 10초는 보정 첫 창(30초)이 차기 전이라 당시 임계가 상한 0.65였고, 이 사람의 감은 눈 점수는 중앙값 0.52였다. 두 번째 창부터 임계가 0.45로 내려와 뒤 구간에서는 잡혔다. 측정 절차는 첫 감김 전에 보정이 끝나게 바꿨다.
- 깨어난 뒤 졸음이 25초에서 63초까지 남았다. 연속 규칙은 7초 안에 풀렸지만 비율 창이 감긴 표본을 들고 있어 붙잡았다. 뜬 눈이 3표본(6초) 이어지면 창을 비우는 규칙을 넣었고, 창은 44초로 줄였다.
- 연속 규칙의 해제도 3표본 중앙값 탓에 5초에서 7초가 걸려 체감이 늦었다. 다듬기 창을 둘로 줄여 뜬 표본 하나에 내려오게 하고, 해제 유지시간을 3초에서 2초로 줄였다. 진입은 감김 둘에 10초 유지라 그대로 보수적이다.
- 고개를 뒤로 젖히면 얼굴은 64% 잡혔지만 눈 점수가 뜬 눈 수준(중앙값 0.12)이라 졸음이 서지 않았다. 눈 점수만으로는 못 잡는 자세라 기록만 남긴다. 안경 구간은 44초 내내 얼굴이 안 잡혀 각도 문제인지 안경 문제인지 다시 재야 한다.

#### 상태의 수명

보정 표본과 기준값·임계는 일시정지를 넘어 유지되고 `close()`에서만 버린다. 그 사람의 눈이 원래 몇 점인지는 공백과 무관하고, 일시정지마다 다시 보정하면 재개 후 30초 동안 고정 임계로 돌아가 판정이 흔들린다. 비율 창은 반대로 `stop()`에서 비우고, 자리 이탈·얼굴 모델 사망·눈 판정이 평활 창만큼 연속으로 걸러진 경우에도 비운다. 지금 졸고 있는지를 재는 값이라 공백 앞뒤를 이으면 깨어난 사람이 옛 표본만으로 졸음으로 읽힌다.

비율 규칙이 처음 설 수 있는 시점. 보정 전에는 판정을 쉬고 비율 창도 쌓지 않으므로, 비율 규칙은 첫 보정 창이 찬 뒤 다시 표본 22개가 쌓여야 설 수 있다. 세션 시작 뒤 약 74초다. 예전에는 첫 보정이 임계를 정하는 순간 옛 표본을 새 임계로 한꺼번에 채점했는데, 그쪽이 오탐 방향이라 이 지연을 받아들였다.

### 내려다봄 게이트를 더한다 (2026-09-22, BY-704 첫 실기기 측정)

**관측.** 폰을 내려다보는 `휴대폰` 구간에서 눈 감김 점수가 중앙값 0.554, 상위 5% 0.682였다. 스파이크의 "책을 볼 때 최대 0.36~~0.38"은 책상 위 폰을 보는 가파른 각도에서 성립하지 않는다. 보정된 임계(기준값 + 0.25)로는 갈라지지 않고, 임계를 0.7까지 올리면 진짜 감김(평균 0.53~~0.57)을 놓친다. **눈 점수 하나로는 감김과 내려다봄이 갈리지 않는다.**

**결정.** 자세 행렬(`outputFacialTransformationMatrixes`)에서 고개 숙임 각도 하나를 뽑아, `HEAD_PITCH_DOWN_DEG`(잠정 25°) 이상이면 눈 판정을 쉰다(`eyeSkipReason: "looking-down"`, "판정 없음"이지 "눈 뜸"이 아니다). 고개를 숙인 채 자는 것은 잡지 않는다 — 리더 결정: "내려다볼 때 자는 건 못 잡아도 내려다보는 게 졸음으로 인식되면 안 된다." 행렬은 래퍼 안에서 각도 스칼라로 줄어들고 좌표는 여전히 나가지 않는다.

**측정 도구에 더한 것.** 구간별 `headPitch`·`ear` 분포와 `skipped["looking-down"]`. EAR(눈 종횡비)은 판정에 쓰지 않고 blendshape와 비교하기 위해서만 남긴다. 게이트 값과 자세 행렬의 부호는 다음 회차에서 확정한다(런북 §3·§9).

**같이 고친 것.** 개발 빌드에서 감지기가 둘 만들어져(StrictMode) 패널·덩어리가 안 쓰는 쪽의 보정을 읽던 버그. 보정 getter 등록을 생성 시점에서 `start()` 시점으로 옮겼다.

**대표 트리거 규칙은 그대로.** 폰이 보이면서 눈이 "감긴" 상태는 자는 게 아니라 폰을 보는 것이었다. 먼저 확정된 `PHONE`이 유지되는 현재 규칙이 이 경우 더 정확한 이름을 남긴다.

### 내려다봄 게이트를 뺀다, 화소 대비를 잰다 (2026-09-22, BY-704 둘째·셋째 회차)

**게이트 결과.** 15°에서 `내려다봄`은 막혔지만(15번 중 12번 게이트, 졸음 없음), 폰을 얼굴보다 낮게 두면 고개가 떨어지는 순간 정상 판정까지 끊겼고, 살짝 숙인 채 자는 것도 놓쳤다. 리더: "고개 각도는 해결이 아니다. 정면에서 찍었을 때 살짝 숙이면 감김으로 읽히는 것 자체를 풀어야 한다." 게이트를 뺐다. 고개 각도는 덩어리에 참고값으로만 남긴다.

**셋째 회차.** 같은 자세(고개 약 20°)에서 `내려다봄`과 `숙이고 감기`를 비교했다. 눈 감김 점수는 둘 다 게이트에 걸려 표본이 없고, EAR은 0.085 vs 0.074, 내려다봄 점수(`eyeLookDown`)는 중앙값 0.339 vs 0.434에 분포가 통째로 겹쳤다(내려다봄 p95 0.482 > 감기 p50 0.434). 스파이크의 0.6~0.8은 고개를 세우고 감았을 때 값이었다. **셋 다 얼굴 모델의 눈 윤곽 랜드마크에서 파생되므로, 위에서 본 뜬 눈을 모델이 "닫힌 눈"으로 찍는 순간 어떤 조합도 같은 답이 된다.**

**다음 후보: 눈 영역 화소.** 랜드마크로 눈 자리를 잡고 그 자리만 48×24로 떠서 밝기 표준편차(`eyeContrast`)와 평균의 절반보다 어두운 화소 비율(`eyeDark`)을 잰다. 뜬 눈은 위에서 봐도 동공·홍채가 보여 둘 다 있고, 감은 눈은 눈꺼풀 피부라 둘 다 낮아야 한다. 판정에는 아직 쓰지 않고 측정 도구에만 싣는다. 상자 높이는 윤곽 폭 기준이다 — 위에서 본 뜬 눈은 윤곽이 선으로 찌그러진다. 화소는 그 자리에서 숫자 둘로 줄고 버려진다.

**갈리지 않으면** 남는 길은 시간축이다. 30초마다 몇 초를 5Hz로 몰아 보고 깜빡임 유무로 가른다(발열 예산 약 +3%p).
