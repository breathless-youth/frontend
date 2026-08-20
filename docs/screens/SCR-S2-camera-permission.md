# SCR-S2 카메라 권한 (S2-2 요청 · S2-3 거부 안내)

## Purpose

FocusON은 카메라로만 측정한다(`ai-wiki/product/policies.md` §3 "카메라 필수: MVP는 카메라 권한 없이 사용 불가"). 이 화면 그룹은 그 전제를 사용자에게 처음 설명하고 동의를 받는 지점이다.

- **S2-2 카메라 권한 요청**은 iOS/Android가 그리는 **OS 네이티브 다이얼로그**다. 앱이 직접 그리는 UI가 없고, 앱이 통제할 수 있는 것은 목적 문구(`NSCameraUsageDescription`)와 **요청 시점**뿐이다.
- **S2-3 권한 거부 안내**는 앱이 직접 그리는 신규 전체 화면이다. 권한이 없으면 측정이 불가능하다는 사실을 처벌조가 아닌 안내조로 전달하고, 시스템 설정으로 보내 되돌릴 길을 준다. 동시에 "영상은 기기 밖으로 나가지 않는다"는 프라이버시 고지를 다시 한 번 노출해 재허용의 심리적 장벽을 낮춘다.

## Source Of Truth

- Figma file: FocusON V1.0 Design (파일 키 `KmTbXL79g6ximY1RcnBZDz`)
- Figma page: `📱 3. Screens — iOS (V1.0)` — node `14:4`
- **S2-2**
  - Figma frame: `S2-2 · 카메라 권한 요청`
  - Figma node: `52:139` (하위 OS 다이얼로그 목업 `52:152` `ios-alert`, 딤 `52:151`)
  - URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=52-139
- **S2-3**
  - Figma frame: `S2-3 · 권한 거부 안내`
  - Figma node: `52:312`
  - URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=52-312
- ai-wiki 근거 문서
  - `ai-wiki/product/policies.md` — §1 사용자 고지(권한 문구 확정, 2026-07-26), §3 카메라 필수
  - `ai-wiki/product/voice-tone.md` — §4 "카메라 권한 (S2-2 · S2-3)" 문구 표 (그대로 인용, 의역 금지)
  - `ai-wiki/product/design.md` — 플랫폼 분기 원칙(2026-07-26), 화면 인벤토리 (V1.0 최종)
  - `ai-wiki/product/user-flow.md` — 핵심 플로우 / 예외 플로우 "카메라 권한 거부"
  - `ai-wiki/product/mvp-scope.md` — 세션 UX 정책 "최초 시작 (2026-07-26 확정)"
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — 카메라 권한 문구 확정, 최초 시작 플로우
  - `ai-wiki/project/glossary.md` — 앱명 `FocusON`, 카메라 동작 동사는 "측정"으로 통일
- Ownership: `frontend/docs/screen-ownership.md` — S2-2 · S2-3 모두 `apps/mobile` 소유
- 담당 앱: `apps/mobile`

Figma가 시각적 SSOT, `ai-wiki`가 문구·정책의 SSOT다. 구현 전 `get_design_context`로 노드 `52:312`(S2-3)를 반드시 재확인한다. 절대 좌표를 그대로 베끼지 말고 Flexbox + SafeArea 레이아웃으로 매핑한다.

## Ownership Boundary

- 이 화면 그룹은 **앱 셸(권한 게이트)** 소유다. 카메라 프리뷰·Vision 추론·세션 타이머는 전혀 그리지 않는다 — 그건 `apps/web`이 WebView로 제공하는 S3 계열 영역이다(ADR 0001).
- **S2-2에는 만들 커스텀 UI가 없다.** Figma의 `ios-alert`(`52:152`)는 OS 다이얼로그를 문서용으로 그려둔 **목업**이다. 이 목업을 React Native 컴포넌트로 재현하면 안 된다 — 실제 다이얼로그의 틀·버튼 라벨·폰트는 OS가 그리고 앱은 바꿀 수 없다(`design.md` 플랫폼 분기 원칙: "플랫폼별 차이는 OS 시스템 영역뿐").
- 카메라 SDK를 UI 컴포넌트에서 직접 호출하지 않는다(`apps/mobile/CLAUDE.md` 경계 규칙). 권한 조회/요청은 `lib/`의 어댑터 함수 뒤에 격리한다.
- V1.2+ 범위(S0 로그인, S7~S11 소셜)는 건드리지 않는다.

## Current Figma Structure

### S2-2 · 카메라 권한 요청 (`52:139`, 402×874)

```text
S2-2 · 카메라 권한 요청
  ├ (배경) S1 홈 프레임 전체 복제 — Status Bar / 헤더 / Hero / Start CTA / 캡션 / Stat×2 / Guide / Tab Bar
  ├ dim (52:151, 402×874 전면 딤)
  └ ios-alert (52:152, 270×159.7, x=66 y=357, r14, bg rgba(247,247,247,0.97), shadow 0 12 32 rgba(0,0,0,.25))
      ├ text (52:153)
      │   ├ 52:154  "“FocusON”이(가) 카메라에 접근하려고 합니다"  16px SemiBold / lh21 / #000
      │   └ 52:155  "집중 측정에 사용해요. 영상은 기기 안에서만 처리되고 저장되지 않아요."  12.5px Regular / lh17 / #3D3D42
      ├ divider (52:156, 0.7px rgba(60,60,67,.29))
      └ actions (52:157, h44)
          ├ btn-허용 안 함 (52:158/52:159)  16.5px Regular  #3478F6
          └ btn-허용      (52:161/52:162)  16.5px SemiBold #3478F6
```

**이 트리 전체가 "구현 대상 아님"이다.** 배경(S1 홈)은 MG1에서 이미 구현됐고, 딤·얼럿은 OS가 그린다. 앱이 이 프레임에서 가져가는 산출물은 **`52:155`의 본문 문구 하나**뿐이며, 그것이 `app.json`의 `NSCameraUsageDescription`이 된다.

### S2-3 · 권한 거부 안내 (`52:312`, 402×874, bg `bg/base`)

```text
S2-3 · 권한 거부 안내
  ├ iOS / Status Bar (52:313)                       OS 크롬 — 앱이 그리지 않음
  ├ icon-circle (52:330)  66×66, r999, fill #F2F4F6 (⚠️ 변수 바인딩 없음 — 아래 주의)
  │   └ icon/camera-off (52:331) 28×28, Vector 3개 (SVG로 내보내 사용)
  ├ 52:335  "카메라 권한이 필요해요"                  20px Bold / lh24 / text/primary / center / y=366
  ├ 52:336  "측정은 카메라로만 할 수 있어요.\n설정에서 허용하면 바로 시작할 수 있어요."
  │                                                  14px Regular / lh21 / text/secondary / center / y=400
  ├ 52:337  "영상은 기기 안에서만 처리되고 저장되지 않아요"
  │                                                  12px Regular / lh14 / text/tertiary / center / y=452
  ├ Button / CTA (52:338)  362×52, x=20 y=722, r16, bg brand/primary
  │   └ 라벨 "설정 열기"                              16px Bold / lh19 / #FFF (text/onBrand)
  ├ 52:340  "홈으로 돌아가기"                         13px Medium / lh16 / text/secondary / center / y=800
  └ iOS / Home Indicator (52:341)                    OS 크롬 — 앱이 그리지 않음
```

수직 간격(실측): 아이콘 원 하단 327 → 타이틀 366 (39) → 본문 400 (10) → 캡션 452 (10). 하단: CTA 하단 774 → 링크 800 (26) → 링크 하단 816, 프레임 하단까지 58(= 홈 인디케이터 34 + 여백 24).

**탭 바가 없다.** 전체 화면 스택 라우트다(탭 위에 올라오는 화면).

⚠️ `icon-circle`의 `#F2F4F6`은 Figma에서 시맨틱 변수에 바인딩되지 않은 하드코딩 값이다(다른 요소는 `var(--text/primary)` 등으로 바인딩됨). 이 값은 `colors.bg.layer2.light`와 정확히 일치하므로, 코드에서는 **`bg/layer2` 토큰으로 바인딩해 다크모드에서 어두워지게** 한다(S1의 두들 일러스트와 동일한 처리 — `SCR-S1-home.md` Current Limitations 참고). Figma 원본 수정은 Review Checklist로 남긴다.

## Content

모든 문구는 `ai-wiki/product/voice-tone.md` §4 "카메라 권한 (S2-2 · S2-3)"에서 **그대로** 가져왔고, Figma 텍스트 노드와 문자 단위로 일치함을 확인했다. 의역·줄임·문장부호 변경 금지.

### S2-2 — 권한 요청 목적 문구 (Info.plist / iOS 시스템 팝업)

```
집중 측정에 사용해요. 영상은 기기 안에서만 처리되고 저장되지 않아요.
```

- 마침표 포함, 위 문자열 그대로. (`policies.md` §1 확정 2026-07-26 · `voice-tone.md` §4 · Figma `52:155` 3곳 일치)
- **현재 `apps/mobile/app.json`의 값은 낡았다**:

  | 위치                                                 | 값                                                                     |
  | ---------------------------------------------------- | ---------------------------------------------------------------------- |
  | 현재 코드 (`ios.infoPlist.NSCameraUsageDescription`) | `캠스터디 참여 시 집중도 측정을 위해 카메라를 사용합니다.` ← **폐기**  |
  | 확정 카피 (교체할 값)                                | `집중 측정에 사용해요. 영상은 기기 안에서만 처리되고 저장되지 않아요.` |

  현재 값은 ① 확정 카피와 다르고 ② "-습니다"체라 `voice-tone.md` §1 "해요체 통일"을 위반하며 ③ "캠스터디"는 `glossary.md`의 사용자 노출 표기가 아니다. 빌더는 **이 문자열을 그대로 교체**한다.

- 다이얼로그 제목("“FocusON”이(가) 카메라에 접근하려고 합니다")·버튼 라벨("허용 안 함"/"허용")은 **OS가 생성**한다. 앱 문자열로 하드코딩하지 않는다. 제목의 앱 이름은 iOS `CFBundleDisplayName`(= `app.json`의 `expo.name`)에서 온다 — 아래 Current Limitations의 앱 표시명 이슈 참고.
- Android: 시스템 다이얼로그 문구는 OS 고정이며 앱이 제공할 목적 문구가 **없다**(`design.md` "Android는 OS 기본 문구"). `app.json`의 `android.permissions: ["CAMERA"]`는 이미 올바르므로 손대지 않는다.

### S2-3 — 화면 문구

| 요소      | 문구 (그대로)                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 타이틀    | `카메라 권한이 필요해요`                                                                                                           |
| 본문      | `측정은 카메라로만 할 수 있어요. 설정에서 허용하면 바로 시작할 수 있어요.` (Figma는 두 문장 사이에서 줄바꿈 — 문장 단위 개행 유지) |
| 캡션      | `영상은 기기 안에서만 처리되고 저장되지 않아요` (마침표 없음)                                                                      |
| 기본 버튼 | `설정 열기`                                                                                                                        |
| 보조 링크 | `홈으로 돌아가기`                                                                                                                  |

프라이버시 캡션은 **싱글룸 문구**다. V1.0 화면 인벤토리에는 멀티룸 화면이 없으므로(`design.md` — S7~~S11은 V1.2~~V1.4) 멀티룸 표현("AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않아요")을 이 화면에 절대 가져오지 않는다. `frontend/CLAUDE.md`·`apps/mobile/CLAUDE.md`·ADR 0002가 멀티룸을 현재형으로 서술하더라도 마찬가지다.

## Data Contract

**이 화면 그룹은 서버 API를 호출하지 않는다.** 권한 상태는 OS가 보유한 기기 로컬 상태이고, 서버로 전송할 값이 없다(`policies.md` §1 "서버 전송 데이터: 판단 결과만 전송 — 세션 요약, 감지 이벤트 로그").

- `@focusmakers/types`(`packages/types/src/index.ts`)에 권한 관련 타입은 없고, **필요하지도 않다** — 새로 만들지 않는다.
- 권한 상태를 별도로 영속 저장하지 않는다. OS 권한 상태(미결정/허용/거부)가 단일 진실이며, 앱이 `granted` 플래그를 `expo-secure-store`나 AsyncStorage에 복제하면 설정 앱에서 바뀐 값과 어긋난다. **로컬 미러링 금지.**
  - (참고: G1~G5 온보딩의 "최초 1회" 판정용 영속 플래그는 별개 관심사다 — MG5 스펙 소관이며 이 화면에서 만들지 않는다.)
- 권한 조회/요청은 **`expo-camera`(`~17.0.10`)의 권한 API로 구현한다** — 2026-07-27 확정([ADR 0004](../adr/0004-expo-camera-for-permission-api-only.md)). 카메라 프리뷰(`CameraView`)는 쓰지 않는다: 카메라 스트림은 `apps/web`의 WebView `getUserMedia` 소유다(ADR 0001). `expo-camera`는 Expo Go에 기본 포함이라 Dev Client가 필요 없고, `app.json`은 바뀌지 않는다(config plugin 미추가 — 근거는 ADR 0004).

어댑터 인터페이스(패키지가 아니라 `apps/mobile/lib/`에 둔다 — 화면 전용 코드를 공유 패키지로 미리 빼지 않는다):

```ts
// apps/mobile/lib/cameraPermission.ts
export type CameraPermissionStatus = "undetermined" | "granted" | "denied";

export function getCameraPermissionStatus(): Promise<CameraPermissionStatus>;
/** OS 다이얼로그(S2-2)를 띄운다. denied 상태에서는 iOS가 다시 띄우지 않으므로 즉시 denied를 반환한다. */
export function requestCameraPermission(): Promise<CameraPermissionStatus>;
/** OS 설정 앱의 이 앱 설정 화면으로 이동. S6 설정의 "카메라 권한" 행과 공유한다. */
export function openAppSettings(): Promise<void>;
```

`expo-camera`의 `PermissionStatus` enum 값이 `"granted"`/`"undetermined"`/`"denied"`로 위 유니온과 그대로 일치해 변환표가 없다. 두 함수는 개별 export가 아니라 집계 객체 `Camera`로만 도달한다(`import { Camera } from "expo-camera"`) — 개별 import는 typecheck에서 실패한다.

`openAppSettings`는 새 의존성 없이 React Native 코어 `Linking.openSettings()`(RN 0.81)로 구현돼 있다.

## Interaction Contract

### 진입 조건 (권한 게이트)

`mvp-scope.md` §세션 UX 정책 "최초 시작 (2026-07-26 확정)"과 `user-flow.md` 플로우 다이어그램 기준:

```
[홈 S1] "집중 시작" 탭
   ├─ 최초 1회: 온보딩 가이드 G1~G5 자동 실행
   │     └─ G5 CTA "집중 시작하기" 또는 "건너뛰기" (건너뛰어도 세션은 이어서 시작)
   └─ 2회차 이후: 가이드 없이 곧장 아래 권한 분기

[권한 분기] getCameraPermissionStatus()
   ├─ granted      → 세션 시작 (S3-1)
   ├─ undetermined → requestCameraPermission() → OS 다이얼로그 = S2-2
   │                   ├─ 허용  → 세션 시작 (S3-1)
   │                   └─ 거부  → S2-3
   └─ denied       → S2-2를 띄울 수 없다(iOS는 최초 1회만 시스템 다이얼로그를 띄운다)
                     → 즉시 S2-3
```

- 권한 요청은 **최초 1회**다(`mvp-scope.md`). 홈 진입만으로, 앱 실행만으로 요청하지 않는다 — 반드시 "집중 시작" 이후 시점에만 요청한다.
- `denied` 상태에서 "집중 시작"을 다시 눌렀을 때 시스템 다이얼로그를 재요청하려 시도하지 않는다(iOS에서 아무 일도 일어나지 않아 "버튼이 안 먹는" 것처럼 보인다). 상태를 먼저 조회해 S2-3으로 보낸다.

### S2-3 화면 인터랙션

| 사용자 행동                          | 결과                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `설정 열기` 탭                       | `openAppSettings()` — OS 설정 앱의 FocusON 설정 화면으로 이동. iOS/Android 동일 API. 앱 내부 화면 전환 없음(S2-3은 그대로 유지). |
| `홈으로 돌아가기` 탭                 | S2-3 라우트를 닫고 홈(S1)으로 복귀. 세션은 시작하지 않는다.                                                                      |
| 하드웨어 백 / 스와이프 백            | `홈으로 돌아가기`와 동일하게 처리(홈 복귀). 이 화면을 백 제스처로 막지 않는다.                                                   |
| 설정에서 권한을 허용하고 앱으로 복귀 | **홈으로 복귀만 한다. 세션을 자동 시작하지 않는다** — 확정 (2026-07-27, 아래 참조)                                               |

**확정 (2026-07-27): 설정에서 허용 후 복귀 시 동작 = 홈 복귀**

`AppState`가 `active`로 바뀔 때 권한을 재조회하고, `granted`면 S2-3을 닫고 홈으로 복귀한다. **세션은 자동 시작하지 않는다** — 사용자가 명시적으로 "집중 시작"을 누르지 않은 상태에서 카메라를 켜지 않는다. 홈에서 다시 "집중 시작"을 누르면 권한이 이미 허용돼 있으므로 곧바로 세션으로 이어진다.

재조회가 실패하면 이 화면에 그대로 머문다 — 상태를 모르는 채 화면을 옮기지 않는다.

(참고: `design.md` 백로그 6번 "화면 꺼짐·백그라운드 복귀 시 재개 방식"은 **세션 중** 일시정지 복귀에 관한 별개 항목이며 2026-07-26에 **수동 재개**로 확정됐다. 두 결정의 방향이 같다 — 사용자 액션 없이 측정을 재개하지 않는다.)

### 권한 거부 시의 경계

권한이 없어도 홈·기록(S5)·설정(S6) 탭 자체는 계속 사용 가능하다(세션만 막힌다). S2-3은 세션 진입을 막는 게이트일 뿐 앱 전체를 잠그는 화면이 아니다.

⚠️ **이 화면은 현재 막다른 안내이며, 그것이 확정 정책과 어긋난다.** 이 문서는 원래 `policies.md` §3의 "MVP는 카메라 권한 없이 사용 불가. 수동 타이머 모드는 추후 검토"(2026-07-23)를 근거로 "우회 경로를 만들지 않는다"고 적었으나, **그 결정은 2026-07-26에 대체됐다**:

> 카메라 권한 거부 대응: **수동 타이머 모드 제공** — 카메라 권한을 거부해도 수동 시작/종료 타이머로 순공 시간 측정과 통계·스트릭을 동일하게 이용 가능. 설정 > 측정 방식에서 전환 (2026-07-26 결정, 스토어 심사 Guideline 2.1 대응 목적. 기존 "카메라 필수, 수동 모드 추후 검토" 2026-07-23 결정을 대체) — `ai-wiki/product/policies.md` §3

`user-flow.md`(예외 플로우 · S6 행)와 `app-review-checklist.md` 1-1도 같은 방향이며, 심사 체크리스트는 이 항목을 **"FE 구현은 아직 남음, 심사 제출 전 완료 필수 (가장 중요한 액션 아이템)"**으로 표시한다. S2-3에 수동 모드 진입 경로가, S6에 "측정 방식" 행이 필요하다. **이번 범위 밖이며 별도 스펙·티켓으로 진행한다** — 다만 "우회 경로 금지"를 근거로 이 화면을 그대로 굳히지 말 것.

## Design Tokens Used

`packages/design-tokens/src/index.ts`에 실제로 존재하는 키만 적었다. 괄호는 `apps/mobile/tailwind.config.js`의 NativeWind 클래스.

| 용도             | 토큰                    | 클래스                                              |
| ---------------- | ----------------------- | --------------------------------------------------- |
| 화면 배경        | `colors.bg.base`        | `bg-bg-base dark:bg-bg-base-dark`                   |
| 아이콘 원형 배경 | `colors.bg.layer2`      | `bg-bg-layer2 dark:bg-bg-layer2-dark`               |
| 타이틀           | `colors.text.primary`   | `text-text-primary dark:text-text-primary-dark`     |
| 본문 · 보조 링크 | `colors.text.secondary` | `text-text-secondary dark:text-text-secondary-dark` |
| 프라이버시 캡션  | `colors.text.tertiary`  | `text-text-tertiary` (Light/Dark 동일값)            |
| CTA 배경         | `colors.brand.primary`  | `bg-brand-primary dark:bg-brand-primary-dark`       |
| CTA 라벨         | `colors.text.onBrand`   | `text-text-onBrand`                                 |
| CTA 반경 16      | `radius.lg`             | `rounded-lg`                                        |
| 아이콘 원형 반경 | `radius.full`           | `rounded-full`                                      |
| 좌우 패딩 20     | `spacing.xl`            | `px-5`                                              |

타이포는 Figma 실측값이 표준 스케일과 어긋나는 지점이 있다 — S1과 동일하게 **억지로 근사하지 말고 실측값을 쓴다**:

| 요소      | Figma 실측           | 표준 스케일 대응                                                    |
| --------- | -------------------- | ------------------------------------------------------------------- |
| 타이틀    | 20px Bold / lh 24    | 스케일 밖 (`heading.h3` 18 · `heading.h2` 22 사이) → 실측 사용      |
| 본문      | 14px Regular / lh 21 | 스케일 밖 (`body.md` 15 · `body.sm` 13 사이) → 실측 사용            |
| 캡션      | 12px Regular / lh 14 | `typography.caption`(12/16)과 크기 일치, 행간만 14 → 실측 행간 사용 |
| CTA 라벨  | 16px Bold / lh 19    | `label.lg`(16/24 medium)와 크기 일치, weight/행간 다름 → 실측 사용  |
| 보조 링크 | 13px Medium / lh 16  | `body.sm`(13/20 regular)와 크기 일치, weight 다름 → 실측 사용       |

## Components

**기존 재사용**

- `apps/mobile/components/icons.tsx` — 아이콘은 이 파일의 SVG 컴포넌트 패턴을 따른다(`react-native-svg`, `color` prop 런타임 틴팅).
- `apps/mobile/components/TabBar.tsx` — **이 화면에서는 쓰지 않는다**(S2-3에 탭 바 없음).

**이번에 새로 추출**

- `IconCameraOff` — `icons.tsx`에 추가. Figma `icon/camera-off`(`52:331`, 28×28, Vector 3개)를 **SVG로 내보내 path 데이터를 그대로 옮긴다.**
- `PrimaryCtaButton` (또는 동등물) — Figma 공용 컴포넌트 `Button / CTA`(`40:94`). 컴포넌트 설명상 변형이 3종이다: **XL 362×56(결과 화면) · LG 362×52(시트/이 화면) · Dark SM 136×48(다크 다이얼로그)**. S3-8·S4·G1~G5에서도 재사용되므로 `apps/mobile/components/`로 승격해 만들되, **이번 화면에 필요한 LG 변형만 구현**한다(쓰지 않는 변형을 미리 만들지 않는다).
- S2-3 라우트 컴포넌트 — 전체 화면 스택 라우트(예: `apps/mobile/app/permission-denied.tsx`). 정확한 경로·네비게이션 방식은 빌더가 `expo-router` 구조에 맞게 정하되, **탭 네비게이터 안(`app/(tabs)/`)에 두지 않는다.**

**S2-2용 컴포넌트는 없다.** 산출물은 `app.json` 문자열 교체 1건이다.

## Implementation Notes For AI Agents

1. 착수 전 이 문서와 `frontend/docs/screen-ownership.md`, `apps/mobile/CLAUDE.md`를 읽는다.
2. Figma 노드 `52:312`를 `get_design_context`로 재확인한다(호출 전 `figma:figma-design-to-code` 스킬 선행 필수). `52:139`는 **읽기만 하고 구현하지 않는다.**
3. **S2-2 작업 = `apps/mobile/app.json` 한 줄 교체.** `ios.infoPlist.NSCameraUsageDescription`을 위 Content 표의 확정 문자열로 바꾼다. 그 외 `app.json` 키는 건드리지 않는다 — 특히 `expo.name`/`expo.slug`는 **바꾸지 말고** Review Checklist로 올린다(앱 표시명 변경은 이 화면 범위를 넘는 결정이고 `slug` 변경은 EAS 프로젝트에 영향).
4. **마이크 권한을 추가하지 않는다**(`apps/mobile/CLAUDE.md` — 멀티룸 음성 송출 없음). `android.permissions`도 그대로 둔다.
5. 아이콘은 **SVG path로 옮긴다. PNG 금지** — Figma의 PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 흰 네모로 보인다(2026-07-26 S1에서 실제 발생, `SCR-S1-home.md` 참고). SVG에서는 해당 `<rect>`만 제외한다.
6. `icon-circle` 배경은 Figma의 하드코딩 `#F2F4F6`을 그대로 쓰지 말고 **`bg/layer2` 토큰에 바인딩**한다(다크모드에서 밝은 회색 원이 튀지 않게).
7. 권한 조회/요청은 `apps/mobile/lib/cameraPermission.ts` 어댑터 뒤에 격리한다. **새 네이티브 의존성(`expo-camera` 등)을 임의로 설치하지 않는다** — 인터페이스 + mock + TODO로 두고 리더에게 확인한다. `openAppSettings()`만 실제 구현한다(RN 코어 `Linking.openSettings()` 또는 이미 설치된 `expo-linking`).
8. `openAppSettings()`는 S6 설정의 "카메라 권한" 행에서도 쓰인다 — `lib/`에 한 번만 만들고 두 화면이 공유한다(MG4에서 중복 생성 금지).
9. 이 화면에서 카메라 프리뷰·세션 타이머·WebView를 렌더링하지 않는다.
10. 문구는 위 Content 표에서 복사해 붙인다. 임의 개행·존댓말 변경·마침표 추가 금지.
11. 라이트/다크 모두 시뮬레이터에서 확인한다(`tailwind.config.js`의 `darkMode: "media"`).

## Accessibility Requirements

- `설정 열기` 버튼: 실측 52px 높이로 44px 최소 터치 타겟 충족. `accessibilityRole="button"`.
- `홈으로 돌아가기`: 텍스트 자체 높이가 16px뿐이다 — **상하 패딩으로 터치 영역을 최소 44px까지 확장**한다(시각 위치는 Figma 유지). `accessibilityRole="button"`.
- `icon/camera-off`는 장식 요소다 — 스크린 리더에서 제외한다(`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`). 의미는 타이틀 텍스트가 전달한다.
- 화면 진입 시 스크린 리더 포커스가 타이틀("카메라 권한이 필요해요")로 가도록 한다.
- 시스템 폰트 확대 시 본문 2줄과 캡션이 잘리지 않아야 한다 — 고정 높이를 주지 말고 `numberOfLines` 제한을 걸지 않는다. 확대 시 CTA가 화면 밖으로 밀리면 내용 영역을 스크롤 가능하게 둔다.
- 정보를 색상 단독으로 전달하는 요소가 없다(`design.md` 상태 컬러 보조 규칙 준수). 프라이버시 고지는 항상 텍스트로 노출한다.
- 라이트/다크 모두에서 캡션(`text/tertiary`, Light/Dark 동일 `#8B95A1`)의 대비를 실기기에서 확인한다.

## Current Limitations

- ~~권한 조회/요청 네이티브 모듈 미정~~ → **해소 (2026-07-27)**: `expo-camera ~17.0.10`으로 실제 조회·요청을 구현했다([ADR 0004](../adr/0004-expo-camera-for-permission-api-only.md)). iOS 시뮬레이터에서 조회가 OS 실제 상태를 따라오는 것을 확인했다(`simctl privacy revoke`/`grant`에 S6 토글이 반응). **다만 OS 권한 다이얼로그(S2-2) 자체의 노출은 아직 시각 확인하지 않았다** — 자동화로 탭할 수단이 없어 수동 확인이 남아 있다.
- ~~설정 복귀 후 동작 미정~~ → **해소 (2026-07-27)**: 홈 복귀로 확정. 위 Interaction Contract 참고.
- **Figma의 S2-2 배경과 확정 플로우의 괴리** — Figma `52:139`는 다이얼로그를 **S1 홈 위에** 얹어 그렸지만, `mvp-scope.md`·`user-flow.md`의 확정 플로우에서 권한 요청 시점은 **G5(온보딩 마지막) 이후**다. 다이얼로그 뒤 배경은 OS가 통제하지 않는 앱 화면이므로 구현에는 영향이 없으나, **"홈에서 집중 시작을 누르는 즉시 권한을 요청한다"로 오독하면 안 된다.** ai-wiki가 최신(2026-07-26)이므로 플로우는 ai-wiki를 따르고, Figma 시안 갱신은 Review Checklist로 남긴다.
- **앱 표시명 — `FocusON`으로 확정 및 반영 완료**(2026-07-26 리더 확정). `app.json`의 `expo.name`을 `"FocusON"`으로 변경해 iOS 다이얼로그 제목이 Figma·`glossary.md`와 일치한다. `expo.slug`(EAS 프로젝트 식별자)는 영향 범위가 커서 변경하지 않고 `"mobile"`로 유지했다 — slug 변경이 필요하면 별도 결정.
- **Android 분기 시안 없음** — Figma `4. Screens — Android` 페이지(`14:5`)는 비어 있다(`design.md` 백로그 7번 ②). Android 3옵션 권한 다이얼로그(앱 사용 중에만/이번만/허용 안 함)의 거부 판정 처리(특히 "이번만 허용" 이후 만료)는 시안·정책이 모두 없다. iOS 기준으로 구현하고 Android 차이는 별도 확인.
- **WebView 이중 권한 프롬프트 리스크(미검증)** — 세션은 `apps/web`을 WebView로 로드하고 그 안에서 `getUserMedia`가 호출된다(ADR 0001). 네이티브 권한과 별개로 WebView 계층의 권한 처리(`react-native-webview`의 미디어 캡처 권한 설정 등)가 필요할 수 있는데, `react-native-webview`가 아직 설치돼 있지 않아 검증되지 않았다. S2-2 다이얼로그가 두 번 뜨거나 순서가 꼬일 가능성이 있다 — 세션 화면(WG 계열) 연동 시점에 실기기로 확인해야 한다.
- **자동 종료·세션 전이 미연결** — S2-3에서 허용 후 진입할 세션 화면(S3-1)이 아직 없다. 이동 핸들러는 만들되 목적지가 없으면 방어적으로 아무 동작도 하지 않게 둔다(S1의 선례와 동일).

## Review Checklist

- [x] `app.json`의 `expo.name`을 `"FocusON"`으로 변경 완료(2026-07-26). `expo.slug`는 EAS 영향으로 `"mobile"` 유지 — 필요 시 별도 결정.
- [x] 카메라 권한 조회/요청에 쓸 네이티브 모듈 확정 — **`expo-camera ~17.0.10`, 권한 API만** (2026-07-27 리더 승인, [ADR 0004](../adr/0004-expo-camera-for-permission-api-only.md)).
- [x] **설정에서 권한 허용 후 앱 복귀 시 동작 확정** — **홈 복귀, 세션 자동 시작 안 함** (2026-07-27).
- [ ] S2-2 OS 권한 다이얼로그 실제 노출 확인 — 시뮬레이터/실기기에서 "집중 시작" → G5 이후 다이얼로그가 뜨는지 수동 확인 필요(자동화 탭 수단 없음).
- [ ] **S2-3에 수동 타이머 모드 진입 경로 추가** — `policies.md` §3(2026-07-26)·`app-review-checklist.md` 1-1 확정 정책이며 심사 제출 전 필수. 별도 스펙·티켓.
- [ ] Figma S2-2(`52:139`)의 배경을 확정 플로우(G5 이후)에 맞춰 갱신할지 — 현재 S1 홈 위에 그려져 있어 요청 시점을 오독할 여지가 있다.
- [ ] Figma `icon-circle`(`52:330`)의 `#F2F4F6`에 `bg/layer2` 변수 바인딩 추가 — 지금은 하드코딩이라 Figma 자체 다크모드에서 흰 원이 남는다(코드는 토큰으로 바인딩해 선반영).
- [ ] Android 권한 다이얼로그(3옵션) 시안 및 "이번만 허용" 만료 시 처리 정책 확정 — Figma `14:5` 페이지가 비어 있다.
- [ ] WebView(`apps/web`) `getUserMedia`와 네이티브 카메라 권한의 상호작용 실기기 검증 — 이중 프롬프트 여부.
- [ ] `radius.full` 값 불일치(디자인 토큰 `999` vs `tailwind.config.js` `9999px`) — 시각 차이는 없지만 `design-tokens-sync`가 정리할 것.
