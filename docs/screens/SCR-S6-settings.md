# SCR-S6 설정

## Purpose

FocusON 모바일 앱의 **설정 탭**이다(V1.0 3탭 — 홈·기록·설정 중 세 번째). 사용자가 "왜 내 시간이 이렇게 기록됐지?"를 스스로 확인할 수 있는 진입점(**측정 기준 안내** → 온보딩 가이드 재진입)과, 측정의 전제 조건인 **카메라 권한** 상태 확인 경로를 제공한다. 그 외에는 문의·약관·정보 같은 정적 진입점만 갖는 얕은 화면이다.

V1.0은 **익명 기기 계정**이라 로그인·로그아웃·계정 삭제 항목이 없다(`ai-wiki/product/policies.md` §2 — 로그인은 V1.2부터). 설정은 "기능을 켜고 끄는 곳"이 아니라 "**측정 방식을 이해하고, 권한을 확인하러 가는 곳**"이다 — 이 화면에서 앱이 직접 바꾸는 상태는 하나도 없다.

## Source Of Truth

- Figma file: **FocusON V1.0 Design** (파일 키 `KmTbXL79g6ximY1RcnBZDz`)
- Figma file URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=67-722
- Figma frame: `S6 · 설정` (402×874, iOS master)
- Figma node: **`67:722`** — `get_metadata`(페이지 `14:4` = `📱 3. Screens — iOS (V1.0)`)로 직접 enumerate해 확정(2026-07-26). 페이지 캔버스 라벨 텍스트는 `67:825`.
- 참조한 하위 노드: `67:742`(측정 group-card) · `67:758`(지원 group-card) · `67:767`(약관·정보 group-card) · `67:792`(Navigation / Tab Bar) · 컴포넌트 `43:117`(Settings / Row) · `43:89`(Control / Toggle) · `32:46`(icon/external-link) · `32:36`(icon/chevron-right)
- ai-wiki 근거 문서:
  - `ai-wiki/product/design.md` — 화면 인벤토리(V1.0 최종), 3탭 확정, "정적 안내 화면(S6-1)은 제거 — 가이드로 통합", 백로그 5(푸시 알림 정책 미정)
  - `ai-wiki/product/user-flow.md` — S6 행 정의: "측정(카메라 권한 토글→시스템 설정 · 측정 기준 안내=가이드 재진입) · 지원(문의하기 외부 폼) · 약관·정보(이용약관·개인정보처리방침·오픈소스 라이선스·버전) — **로그아웃·계정 삭제 없음**"
  - `ai-wiki/product/voice-tone.md` — §4 설정(S6) 문구 2건, §4 온보딩 가이드 "마지막 힌트"
  - `ai-wiki/product/policies.md` — §2 계정·데이터(익명 기기 계정, 로그인 V1.2), §1 사용자 고지, 개인정보처리방침 TODO
  - `ai-wiki/product/mvp-scope.md` — 감지 3종(측정 기준 안내 서브 문구의 근거)
  - `ai-wiki/project/glossary.md` — 자리 이탈·휴대폰 사용·기기 조작 노출 표기
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — 최신 확정분(S6 관련 변경은 없음, 가이드 재진입 경로 유지 확인)
- Ownership: `frontend/docs/screen-ownership.md` — **`apps/mobile` 소유**(앱 셸)
- 담당 앱: `apps/mobile` → `app/(tabs)/settings.tsx`(신규 탭) + `app/(tabs)/_layout.tsx` 탭 등록

> **Figma × wiki 교차 대조 결과: 상충 없음.** Figma의 항목 구성·문구가 `user-flow.md`의 S6 정의, `voice-tone.md` §4 설정 문구와 정확히 일치한다(문자 단위 확인). S4에서 알려진 "화면 꺼짐 → 일시정지" 반영 지연 같은 괴리는 이 화면에 없다.

## Ownership Boundary

이 화면이 **하지 않는 것**:

- **카메라 권한을 앱이 직접 요청하거나 철회하지 않는다.** 토글은 조작 컨트롤이 아니라 상태 표시이며, 실제 변경은 OS 설정 앱에서만 이루어진다(`voice-tone.md`: "권한은 시스템 설정에서 바꿀 수 있어요"). 권한 **최초 요청**은 최초 '집중 시작' 플로우(S2-2)의 몫이지 설정의 몫이 아니다.
- **세션·카메라·Vision 코드를 일절 포함하지 않는다.** 세션 화면(S3-1~S3-8)·결과(S4)는 `apps/web`이 구현하고 모바일은 WebView로 로드한다(ADR 0001).
- **온보딩 가이드(G1~G5)의 문구·단계·전환을 여기서 구현하거나 복제하지 않는다.** "측정 기준 안내" 행은 **MG5(`SCR-G1-G5-onboarding-guide.md`)가 만드는 기존 가이드 플로우로 진입시키는 링크일 뿐이다.** 가이드용 설명 문구를 이 화면에 새로 쓰지 말 것 — 중복 문구가 생기면 두 곳이 갈라진다.
- **로그인·계정·프로필·랭킹 진입점을 추가하지 않는다**(V1.2+ 범위).
- **알림 설정 항목을 추가하지 않는다** — 아래 Current Limitations 참조.

## Current Figma Structure

`get_design_context`(node `67:722`)와 `get_metadata`로 확인한 실제 구조다. 좌표는 402×874 프레임 기준 실측값이며, 그대로 절대배치하지 말고 Flexbox로 매핑한다.

```text
S6 · 설정 (402×874, bg/base)
  iOS / Status Bar (67:723 — OS 크롬, 앱이 직접 그리지 않음)
  "설정" (67:740)  x20 y76 · 24px Bold / lh29 · text/primary
  "측정" (67:741)  x24 y128 · 13px Medium / lh15 · text/tertiary   ← 섹션 라벨
  group-card (67:742)  x20 y149 w362 h125 · bg/layer-1 · border 1px border/default · radius 16 · px16
    Settings / Row [Toggle]      (67:743) w330 h59 · py14
      label "카메라 권한" 16px Regular / lh19 · text/primary
      Control / Toggle 51×31 r999 (On = brand/primary, 노브 27 white + shadow)
    hairline (67:748) w330 h1 · #EFF1F3  ← 변수 미바인딩(아래 Design Tokens 참고)
    Settings / Row [ChevronSub]  (67:749) w330 h65 · py14
      labels: "측정 기준 안내" 16px Regular / lh19 · text/primary
              "자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요" 12px Regular / lh15 · text/tertiary
      icon/chevron-right 7×12
  "권한은 시스템 설정에서 바꿀 수 있어요" (67:756) x24 y284 · 12px Regular / lh14 · text/tertiary
  "지원" (67:757)  x24 y318 · 13px Medium · text/tertiary
  group-card (67:758)  x20 y339 w362 h47
    Settings / Row [External]    (67:759) w330 h47 · py14
      label "문의하기" 16px Regular · text/primary
      icon/external-link 12×12
  "약관 · 정보" (67:766)  x24 y410 · 13px Medium · text/tertiary
  group-card (67:767)  x20 y431 w362 h191
    Settings / Row [Chevron] "이용약관"        (67:828) w330 h47
    hairline (67:774)
    Settings / Row [Chevron] "개인정보처리방침"  (67:832) w330 h47
    hairline (67:781)
    Settings / Row [Chevron] "오픈소스 라이선스" (67:836) w330 h47
    hairline (67:788)
    Settings / Row [Value]  "버전 정보" / "1.0.0" (67:789) w330 h47
      value 15px Regular / lh18 · text/tertiary
  Navigation / Tab Bar (67:792)  y797 h77 · 홈 · 기록 · 설정(active = brand/primary SemiBold)
  iOS / Home Indicator (67:823 — OS 크롬)
  hs/tab-home (70:1218) · hs/tab-record (70:1220)  ← 프로토타입 핫스팟(구현 대상 아님, 링크 의도만 확인용)
```

세로 리듬(실측): 섹션 라벨 → 카드 간격 6px · 카드 → 다음 섹션 라벨 간격 20~24px · 카드 하단 → 캡션 10px. 화면 좌우 패딩 20px, 섹션 라벨만 24px(카드 내부 텍스트 시작선 20+16=36px와는 다른 값이니 임의로 맞추지 말 것).

## Content

**모든 문구는 Figma·`voice-tone.md`에서 그대로 인용했다. 의역·윤문 금지.**

| 위치             | 문구                                                           | 근거                                                                               |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 화면 타이틀      | `설정`                                                         | Figma `67:740`                                                                     |
| 섹션 1 라벨      | `측정`                                                         | Figma `67:741`                                                                     |
| 행 1 라벨        | `카메라 권한`                                                  | Figma `43:91`                                                                      |
| 행 2 라벨        | `측정 기준 안내`                                               | Figma `43:97`                                                                      |
| 행 2 서브        | `자리 이탈 · 휴대폰 사용 · 기기 조작을 기기 안에서만 측정해요` | `voice-tone.md` §4 설정(S6) "측정 기준 안내 서브" — Figma `43:98`과 문자 단위 일치 |
| 섹션 1 하단 캡션 | `권한은 시스템 설정에서 바꿀 수 있어요`                        | `voice-tone.md` §4 설정(S6) "권한 안내" — Figma `67:756`과 일치                    |
| 섹션 2 라벨      | `지원`                                                         | Figma `67:757`                                                                     |
| 행 3 라벨        | `문의하기`                                                     | Figma `43:108`                                                                     |
| 섹션 3 라벨      | `약관 · 정보`                                                  | Figma `67:766` (가운뎃점 앞뒤 공백 있음 — `약관 · 정보`)                           |
| 행 4~6 라벨      | `이용약관` / `개인정보처리방침` / `오픈소스 라이선스`          | Figma `67:828` / `67:832` / `67:836`                                               |
| 행 7 라벨·값     | `버전 정보` / `1.0.0`                                          | Figma `43:114` / `43:115`                                                          |
| 탭 라벨          | `홈` · `기록` · `설정`                                         | Figma `35:18` / `35:30` / `35:37`                                                  |

- 서브 문구의 감지 3종 표기(`자리 이탈` · `휴대폰 사용` · `기기 조작`)는 `glossary.md`의 확정 노출 표기다. `딴짓`·`감시`·`적발` 같은 대체어를 쓰지 않는다.
- **이 화면에 프라이버시 캡션을 새로 만들지 않는다.** 서브 문구의 "기기 안에서만 측정해요"가 이미 싱글룸 문구다. V1.0은 싱글룸만 존재하므로 멀티룸 문구("AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다")를 절대 가져오지 않는다.

## Data Contract

**이 화면은 백엔드 API를 호출하지 않는다.** `packages/types/src/index.ts`의 어떤 타입(`UserRegisterRequest/Response`, `StudySessionCreateRequest/Response`, `StudySessionSummary`, `StudySessionListResponse`, `StatusEventPayload`)도 이 화면에 필요하지 않다. 설정 화면용 서버 계약을 새로 만들지 말 것.

화면이 표시하는 값 3종의 출처:

1. **버전(`1.0.0`)** — 로컬 앱 메타데이터. `expo-constants`(이미 설치됨, `~18.0.13`)의 `Constants.expoConfig?.version`을 읽는다. `apps/mobile/app.json`의 `expo.version`이 현재 `"1.0.0"`으로 Figma 예시값과 일치한다. **하드코딩 금지** — 버전 문자열을 상수로 박으면 다음 릴리스에서 즉시 거짓말이 된다.
2. **카메라 권한 상태(토글 On/Off)** — **백엔드 계약이 아니라 OS 권한 상태**다. 그런데 지금 `apps/mobile`에는 이 상태를 읽을 수단이 없다: `expo-camera`가 dependency에 없고(2026-07-26 `package.json` 직접 확인), 카메라는 `apps/web` WebView 소유다. `frontend/CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것" 규칙에 따라 **이번 구현에서 카메라 패키지를 설치하지 않는다.** 화면 컴포넌트는 아래 형태의 값을 **props로 주입받는 구조**로 만들고, 라우트에서는 Figma 예시 상태(`true`)를 넘기며 TODO 주석을 남긴다.
3. **문의/약관/개인정보처리방침/오픈소스 라이선스의 목적지 URL** — **백엔드 계약 미확인 — 상상 계약 금지: `contactFormUrl`, `termsOfServiceUrl`, `privacyPolicyUrl`, `openSourceLicenseUrl`.** ai-wiki 어디에도 실제 URL·문서가 없고, `policies.md`는 "개인정보처리방침(법적 문서)은 출시 전 별도 작성 필요"라고 TODO로 남겨둔 상태다. URL을 지어내지 말고 상수 파일에 `null` 자리만 만들어 둔다.

```ts
// 이 화면 전용 로컬 뷰 모델. packages/types에 export하지 않는다(API 계약이 아니다).
type SettingsViewModel = {
  /** OS 카메라 권한 허용 여부. 조회 수단 확정 전까지 라우트가 정적으로 주입한다. */
  cameraPermissionGranted: boolean;
  /** expo-constants에서 읽은 앱 버전. 예: "1.0.0" */
  appVersion: string;
};

// 목적지 URL은 확정 전까지 null — null이면 행을 비활성(또는 탭 시 no-op)으로 렌더한다.
type SettingsLinks = {
  contactFormUrl: string | null;
  termsOfServiceUrl: string | null;
  privacyPolicyUrl: string | null;
  openSourceLicenseUrl: string | null;
};
```

## Interaction Contract

| #   | 대상                                                     | 동작                                                                                                                                                                                                                                                                                                                                                              | 확정 여부                                                                                                                                                              |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 행 `카메라 권한`(토글 포함 행 전체)                      | 탭 시 **OS 설정 앱의 앱 설정 화면**을 연다 — `react-native`의 `Linking.openSettings()`(신규 의존성 불필요). 앱이 권한을 켜거나 끄지 않는다.                                                                                                                                                                                                                       | ✅ 확정 (`user-flow.md` S6 "카메라 권한 토글→시스템 설정", `voice-tone.md` "권한은 시스템 설정에서 바꿀 수 있어요")                                                    |
| 2   | 토글 자체                                                | **조작 불가·표시 전용.** 사용자가 토글을 끌어도 값이 바뀌지 않는다(낙관적 UI 금지 — 실제 권한과 어긋난 상태를 보여주면 안 된다). 토글 영역도 행과 같은 핸들러로 동작한다.                                                                                                                                                                                         | ✅ 확정(위 근거의 필연적 귀결)                                                                                                                                         |
| 3   | 권한 상태 갱신                                           | 사용자가 OS 설정에서 권한을 바꾸고 돌아오면 표시가 따라와야 한다 → **앱 포그라운드 복귀(`AppState` change → `active`) 시 권한 상태를 재조회**하는 자리를 만들어 둔다. 조회 함수 자체는 (2)의 사유로 지금은 스텁.                                                                                                                                                  | ⚠️ 인터페이스만 구현, 실제 조회는 TODO                                                                                                                                 |
| 4   | 행 `측정 기준 안내`                                      | **MG5의 온보딩 가이드(G1~G5) 플로우를 그대로 재진입**시킨다. 이 화면은 진입만 트리거하고 가이드의 단계·문구·전환은 전혀 알지 못한다.                                                                                                                                                                                                                              | ✅ 확정 (`design.md` "홈 가이드 카드·설정 '측정 기준 안내'에서 재진입", `voice-tone.md` G5 마지막 힌트 "이 안내는 설정 > 측정 기준 안내에서 언제든 다시 볼 수 있어요") |
| 4-a | 재진입 시 G5의 CTA `집중 시작하기` 동작                  | **미정 — 리더/사용자 확인 필요.** 최초 시작 플로우에서는 G5 CTA가 세션을 시작하지만(`mvp-scope.md` 세션 UX 정책), **설정에서 재진입했을 때 CTA가 세션을 시작해야 하는지 그냥 닫혀야 하는지는 ai-wiki 어디에도 없다.** 임의 확정 금지 — 가이드에 "진입 출처(entry point)" 파라미터를 받는 인터페이스만 만들고 동작 분기는 TODO로 남긴다. MG5 스펙과 함께 결정한다. | ❌ 미정                                                                                                                                                                |
| 5   | 행 `문의하기`                                            | 외부 폼을 **외부 브라우저**로 연다(`Linking.openURL`). external-link 아이콘이 "앱 밖으로 나감"을 뜻한다. URL 확정 전까지 탭 no-op.                                                                                                                                                                                                                                | ⚠️ 동작 확정, 목적지 URL 미정                                                                                                                                          |
| 6   | 행 `이용약관` · `개인정보처리방침` · `오픈소스 라이선스` | chevron이므로 **앱 내 이동**(WebView 상세 화면)을 뜻한다 — `screen-ownership.md`도 "비핵심 화면(개인정보처리방침, 이용약관, 외부 문의)은 필요 시 WebView 허용 영역"이라고 본다. 다만 대상 문서·화면이 `design.md`의 V1.0 화면 인벤토리에 등재돼 있지 않다. **URL/문서 확정 전까지 탭 no-op**(존재하지 않는 라우트로 이동 시도 금지 — S1 구현과 동일 원칙).        | ⚠️ 이동 방식 추정, 목적지 미정                                                                                                                                         |
| 7   | 행 `버전 정보`                                           | 탭 불가(트레일링이 값 텍스트뿐이고 chevron 없음).                                                                                                                                                                                                                                                                                                                 | ✅ 확정                                                                                                                                                                |
| 8   | 탭 바 `홈`/`기록`                                        | 각각 홈(S1)·기록(S5)으로 이동. **S5(MG3)가 아직 없으면 그 탭은 기존 방식대로 비활성 유지** — 존재하는 라우트만 연결한다.                                                                                                                                                                                                                                          | ✅ 확정(방어 규칙은 `SCR-S1-home.md` 선례)                                                                                                                             |
| 9   | 화면 진입                                                | 스크롤 가능해야 한다. 콘텐츠 하단(622px)이 탭 바(797px)보다 위라 402×874에서는 스크롤이 없지만, 폰트 확대·소형 기기에서는 넘칠 수 있다.                                                                                                                                                                                                                           | ✅ 확정                                                                                                                                                                |

**S2-3(권한 거부 안내)와 혼동하지 말 것**: S2-3은 최초 세션 시작 플로우에서 권한이 거부됐을 때 나오는 별도 화면이다. 설정 탭의 카메라 권한 행은 권한이 꺼져 있어도 S2-3으로 보내지 않고 **바로 시스템 설정으로 보낸다**(`user-flow.md` 기준).

## Design Tokens Used

`get_variable_defs`(node `67:722`)로 **실제 바인딩이 확인된 토큰만** 아래 6종이다. `packages/design-tokens/src/index.ts`와 `apps/mobile/tailwind.config.js`에 모두 존재하는 키다.

| Figma 변수       | design-tokens 경로      | NativeWind 클래스(라이트 / 다크)                                      | 이 화면에서의 용도                             |
| ---------------- | ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `bg/base`        | `colors.bg.base`        | `bg-bg-base` / `dark:bg-bg-base-dark`                                 | 화면 배경, 탭 바 배경                          |
| `bg/layer-1`     | `colors.bg.layer1`      | `bg-bg-layer1` / `dark:bg-bg-layer1-dark`                             | group-card 배경                                |
| `border/default` | `colors.border.default` | `border-border-default` / `dark:border-border-default-dark`           | group-card 테두리                              |
| `text/primary`   | `colors.text.primary`   | `text-text-primary` / `dark:text-text-primary-dark`                   | 화면 타이틀, 행 라벨                           |
| `text/tertiary`  | `colors.text.tertiary`  | `text-text-tertiary` (라이트·다크 동일값 `#8b95a1`)                   | 섹션 라벨, 서브 문구, 캡션, 버전 값, 비활성 탭 |
| `brand/primary`  | `colors.brand.primary`  | `text-brand-primary`/`bg-brand-primary` / `dark:*-brand-primary-dark` | 토글 On 트랙, 활성 탭                          |

반경: `radius.lg` = 16px(group-card) · `radius.full` = 999px(토글 트랙·노브). Tailwind 키는 `rounded-lg` / `rounded-full`.

**토큰에 바인딩되지 않은 하드코딩 값 2건**(위 `get_variable_defs` 결과에 없음 — 직접 확인):

- **행 사이 헤어라인 `#EFF1F3`** — `border/default`(`#e5e8eb`)와 다른 값이며 다크 변수도 없다. 그대로 하드코딩하면 **다크 모드에서 카드 배경(`#191f28`)에 대해 극단적으로 밝은 선**이 된다. → 구현은 `colors.border.default`(`border-border-default dark:border-border-default-dark`)로 대체하고, Figma 원본 수정은 Review Checklist에 올린다. (S1의 두들 일러스트 하드코딩과 같은 유형의 문제다.)
- **토글 Off 트랙 `#E9E9EA`**(Control/Toggle 컴포넌트 설명 기준) — 대응 시맨틱 토큰이 없고 다크 값도 미정. 대체 가능한 근사 토큰이 없으므로 실측값을 그대로 쓰되, **다크 모드 Off 색은 미정**으로 남긴다.

타이포는 `packages/design-tokens`의 표준 스케일과 정확히 맞지 않는 실측값이 있다 — S1과 동일하게 **억지로 스케일에 맞추지 말고 실측값을 쓴다**:

| 요소               | 실측                                 | 표준 스케일과의 관계                                      |
| ------------------ | ------------------------------------ | --------------------------------------------------------- |
| 화면 타이틀 `설정` | 24px Bold / lh29                     | 스케일 밖(h1 28 / h2 22 사이)                             |
| 섹션 라벨          | 13px Medium / lh15                   | 스케일 밖(`body.sm` 13은 Regular, `label.md` 14는 Medium) |
| 행 라벨            | 16px Regular / lh19                  | `label.lg`(16)는 Medium — weight가 다름                   |
| 행 서브            | 12px Regular / lh15                  | `caption`(12/16)에 근접                                   |
| 하단 캡션          | 12px Regular / lh14                  | `caption`(12/16)에 근접                                   |
| 값(`1.0.0`)        | 15px Regular / lh18                  | `body.md`(15/22) — lineHeight만 다름                      |
| 탭 라벨            | 11px Medium(비활성) / SemiBold(활성) | 스케일 밖 — 기존 `TabBar.tsx` 구현값과 동일               |

폰트는 Pretendard 미설치로 Figma가 Inter 임시 적용 중이다 — **코드에서 폰트 패밀리를 새로 지정하지 않는다**(시스템 폰트 유지, `design.md` 파운데이션 주석 참조).

## Components

**재사용(이미 존재)**

- `apps/mobile/components/TabBar.tsx` — S1에서 만든 3탭 바. `active="settings"`로 사용한다. 설정 탭이 실제 라우트가 되므로 `disabled={id !== "home"}` 조건을 갱신해야 한다(아래 Implementation Notes 4번 — MG3와 공유되는 파일이니 주의).
- `apps/mobile/components/icons.tsx`의 `IconChevronRight` — 행 트레일링 chevron(Figma `32:36`과 동일 아이콘).

**이번에 새로 추출**

- `SettingsSection` — 섹션 라벨 + group-card + (옵션) 하단 캡션을 묶는 래퍼.
- `SettingsRow` — Figma `Settings / Row`(`43:117`)의 5개 variant를 그대로 옮긴다: `toggle` · `chevronSub` · `chevron` · `external` · `value`. 컴포넌트 설명("그룹 카드 안에서 사용, 행 사이 1px 헤어라인은 **화면에서** 배치")대로 **헤어라인은 행이 아니라 카드가 그린다**.
- `PermissionToggle` — **표시 전용** 51×31 트랙(radius full) + 27px white 노브 + 그림자. **React Native의 `Switch`를 쓰지 않는다**: ① 이 토글은 조작 컨트롤이 아니라 상태 표시라 `Switch`의 의미(값 변경)와 어긋나고, ② `Switch`는 Android에서 Material 스위치로 렌더돼 `design.md`의 "앱 UI는 iOS/Android 완전 공통" 원칙과 충돌한다.
- `IconExternalLink` — Figma `icon/external-link`(`32:46`, 12×12). `icons.tsx`에 SVG 컴포넌트로 추가한다.

## Implementation Notes For AI Agents

1. `frontend/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `frontend/docs/screen-ownership.md`, 이 문서를 먼저 읽는다.
2. Figma 노드 `67:722`를 `get_design_context`로 재확인한 뒤 구현한다(스킬 `figma:figma-design-to-code`를 먼저 호출할 것). 절대 좌표를 그대로 베끼지 말고 Flexbox로 매핑한다.
3. 구현 파일은 `apps/mobile/app/(tabs)/settings.tsx`(신규) + `apps/mobile/components/` 하위 신규 컴포넌트 + `apps/mobile/components/icons.tsx`(아이콘 1개 추가)로 한정한다.
4. **탭 등록 시 MG3(S5 기록)와 파일이 겹친다** — `app/(tabs)/_layout.tsx`와 `components/TabBar.tsx`는 두 작업이 함께 건드리는 파일이다. 자기 탭만 추가하고 **상대 탭의 등록·활성화를 지우거나 되돌리지 말 것.** TabBar는 "존재하는 라우트만 활성화"하는 형태로 두고, 기록 탭이 아직 없으면 그 탭만 비활성으로 남긴다.
5. **아이콘은 Figma에서 내보낸 SVG의 path 데이터를 옮겨 `icons.tsx`에 추가한다. 형상을 직접 그리지 말고, PNG를 쓰지 말 것** — Figma의 PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 아이콘이 흰 네모로 보인다(2026-07-26 S1에서 실제로 발생). SVG에서는 그 `<rect>`만 제외하면 된다. 단색 아이콘은 `color` prop으로 런타임 틴팅한다.
6. **새 npm 의존성을 설치하지 않는다.** 필요한 것은 이미 다 있다 — `expo-constants`(버전), `react-native`의 `Linking`(설정 열기·외부 링크), `react-native-svg`(아이콘). **`expo-camera`를 설치하지 말 것**(Data Contract 2번 사유).
7. **URL이 확정되지 않은 행(문의하기·이용약관·개인정보처리방침·오픈소스 라이선스)은 링크를 지어내지 말고 no-op으로 두고 `// TODO(SCRUM-286): URL 미확정` 주석을 남긴다.** 임의의 도메인·placeholder URL을 커밋하지 말 것.
8. **"측정 기준 안내" 행은 MG5의 가이드 플로우를 재사용하는 링크다.** 가이드 문구를 이 화면에 복제하지 않는다. MG5 라우트가 아직 없으면 방어적으로 no-op(존재하지 않는 라우트로 이동 시도 금지), 라우트가 생기면 한 줄 연결로 끝나도록 핸들러를 분리해 둔다. G5 CTA 재진입 동작은 **미정이므로 인터페이스(진입 출처 파라미터)만 만들고 분기는 TODO**.
9. 라이트/다크 모두 시뮬레이터에서 확인한다(`darkMode: "media"`, `userInterfaceStyle: "automatic"`). 특히 헤어라인·토글 Off 색이 다크에서 어떻게 보이는지 반드시 눈으로 볼 것.
10. 이 화면에 알림 설정·로그인·계정 삭제·랭킹·프로필 등 **V1.0 인벤토리에 없는 항목을 추가하지 않는다.**

## Accessibility Requirements

- **터치 타겟**: 모든 행의 실측 높이가 47px(기본) / 59px(토글) / 65px(서브 있음)로 최소 44px를 넘는다 — 행 **전체**를 터치 영역으로 만든다(라벨 텍스트만 누를 수 있게 하지 말 것). 탭 바 아이템도 기존 `TabBar.tsx`처럼 `min-h-11`(44px)을 유지한다.
- **역할·상태**: 카메라 권한 행은 값이 바뀌지 않으므로 `accessibilityRole="switch"`가 아니라 **`"button"`**으로 노출하고, 현재 상태를 라벨에 함께 담는다(예: `카메라 권한, 허용됨, 시스템 설정 열기`). 토글 그래픽 자체는 스크린리더에서 중복 읽히지 않도록 `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` 처리.
- **외부 링크 고지**: `문의하기`는 앱을 벗어나므로 `accessibilityHint`로 "외부 브라우저로 열려요"를 제공한다(아이콘만으로 전달하지 않는다).
- **색상 단독 전달 금지**(`design.md` 상태 컬러 보조 규칙): 토글의 파란색만으로 권한 허용 여부를 전달하지 않는다 — 위 접근성 라벨의 텍스트 상태가 그 역할을 한다.
- **폰트 확대 대응**: 행 높이를 고정값으로 박지 말고 패딩(py 14px) 기반으로 늘어나게 한다. 특히 `측정 기준 안내` 서브 문구는 Figma에서 한 줄(`whitespace-nowrap`)로 잡혀 있지만 한글 시스템 폰트·확대 시 2줄이 될 수 있다 — **줄바꿈을 허용하고 잘리지 않게 한다.**
- 화면 전체를 `ScrollView`로 감싸 확대 시에도 마지막 행에 도달할 수 있게 한다.

## Current Limitations

- **카메라 권한 실제 상태가 연동되지 않는다.** 조회 수단(`expo-camera` 등)이 앱에 없고 추측 설치가 금지돼 있어, 토글은 Figma 예시 상태(`On`)를 정적으로 렌더한다. 실제 권한이 거부된 사용자에게 "허용됨"으로 보일 수 있다는 뜻이다 — 값 주입 지점을 한 곳(prop)으로 모아 어댑터가 준비되면 한 줄로 교체되게 한다. **사용자 배포 빌드에 넣기 전 반드시 해소해야 하는 항목이다.**
- **4개 링크의 목적지가 전부 미정**이다(문의 폼·이용약관·개인정보처리방침·오픈소스 라이선스). `policies.md`도 개인정보처리방침을 "출시 전 별도 작성 필요" TODO로 두고 있다.
- **알림 설정 항목이 없다** — Figma S6에도, `user-flow.md` S6 정의에도 없다. `design.md` 백로그 5가 **푸시 알림 정책 자체를 "미정"**으로 두고 있기 때문이다. 설정에 알림 토글이 있을 것이라 가정하고 임의로 추가하지 말 것.
- **로그인·계정 관련 항목이 없다 — 미포함(V1.2+)이다.** `policies.md` §2: V1.0~V1.1은 익명 기기 계정, 로그인 도입은 V1.2(Google/Apple)부터. `user-flow.md` S6도 "로그아웃·계정 삭제 없음"으로 명시. `design.md` 화면 인벤토리에서 S0 로그인은 V1.2 항목이다. (V1.2 로그인 예고는 이 화면이 아니라 **U1 업데이트 안내 시트**가 담당한다 — MG6.)
- **정적 안내 화면 S6-1은 존재하지 않는다** — `design.md`에서 "정적 안내 화면(S6-1)은 제거 — 가이드로 통합"으로 폐기됐다. 과거 문서에서 S6-1을 보더라도 만들지 말 것.
- 헤어라인·토글 Off 색이 Figma에서 변수 미바인딩(하드코딩)이라 다크 모드 값이 원본에 없다(Design Tokens 섹션 참조).
- 버전 행의 `1.0.0`은 `app.json`의 현재 값과 우연히 일치하는 상태다 — 빌드 버전이 올라가면 자동으로 따라가야 한다(하드코딩 금지).

## Review Checklist

- [ ] **카메라 권한 상태 조회 수단 확정** — 모바일 셸이 권한 상태를 읽을 방법(카메라 패키지 도입 vs WebView 측 상태 전달 vs OS 설정 딥링크만 제공). 실기기 스파이크 필요.
- [ ] **문의 폼 URL** 확정 (외부 폼 주소)
- [ ] **이용약관 / 개인정보처리방침 / 오픈소스 라이선스**의 문서 자체와 목적지 확정 — 앱 내 WebView 화면인지 외부 링크인지 포함. `design.md` V1.0 화면 인벤토리에 등재할지도 함께 결정(`screen-ownership.md`가 "필요 시 WebView 허용 영역"으로만 두고 있음).
- [ ] **설정에서 가이드 재진입 시 G5 CTA `집중 시작하기`의 동작** — 세션 시작 vs 단순 닫기. **임의 확정 금지**, MG5 스펙과 함께 결정.
- [ ] **Figma 헤어라인(`67:748`·`67:774`·`67:781`·`67:788`)에 색상 변수 바인딩 추가** — 현재 `#EFF1F3` 하드코딩이라 Figma 자체 다크 모드에서 카드 배경 대비 과도하게 밝다. 코드는 `border/default`로 대체했지만 원본을 고치지 않으면 다음 익스포트에서 반복된다.
- [ ] **토글 Off 트랙(`#E9E9EA`)의 다크 모드 값 확정** — 대응 시맨틱 토큰 없음.
- [ ] 설정 탭 아이콘·라벨의 활성 표현이 기존 `TabBar.tsx` 구현과 일치하는지(활성 = `brand/primary` + SemiBold) 시각 확인.
- [ ] 알림 설정 항목이 정말 V1.0에 없어도 되는지 재확인(푸시 알림 정책이 `design.md` 백로그에 미정으로 남아 있음).
