# SCR-U1 업데이트 안내 시트

## Purpose

홈(S1) 위에 딤과 함께 올라오는 바텀 시트다. "다음 업데이트에 로그인이 추가되고, 지금까지의 기록은 로그인하면 계정에 그대로 이어진다"는 사실을 미리 알려, V1.2 로그인 도입 시점에 익명 기기 계정 사용자가 기록 손실을 걱정하지 않게 하는 것이 목적이다(계정 병합 정책 근거: `ai-wiki/product/policies.md` §2).

**V1.0에는 이 시트를 "개발만" 한다 — 기본은 노출되지 않는다.** 노출 시점(예: V1.2 로그인 출시 임박)이 오면 외부 설정값만 켜서 활성화한다(`ai-wiki/product/design.md` "업데이트 안내" 행, 2026-07-26 6차 확정). 따라서 이 화면의 구현 성공 기준은 "홈에서 보인다"가 아니라 **"기본 상태에서 절대 보이지 않고, 플래그를 켰을 때만 Figma대로 보인다"**이다.

## Source Of Truth

- Figma file: FocusON V1.0 Design
- Figma file URL: https://www.figma.com/design/KmTbXL79g6ximY1RcnBZDz/FocusON-V1.0-Design?node-id=67-840
- Figma frame: `U1 · 업데이트 안내 (바텀 시트 · 1회)` (캔버스 라벨 텍스트는 `U1 · 업데이트 안내 (1회 노출)`, node `67:863`)
- Figma node: `67:840` (Screens — iOS 페이지 `14:4` 하위, 402×874)
  - 딤: `67:852` (`dim`, 402×874 풀블리드)
  - 시트 인스턴스: `67:853` (`Sheet / Bottom`, x0 y645 402×229)
  - 마스터 컴포넌트: `Sheet / Bottom` = `44:96` (2. Components 페이지 `14:3`) — Figma 컴포넌트 설명: _"바텀 시트 402w. r24(top), pad 12/20/44, 핸들 36×4 #D1D6DB, shadow/sheet-up. 화면에서는 black 60% 딤 위 하단 고정 + 홈 인디케이터 오버레이. U1 업데이트 안내에 사용."_
  - 시트 내부 CTA: `44:93` (`Button / CTA` 인스턴스, 362×52) — 컴포넌트 `40:94` 설명의 **LG 362×52(시트)** 사이즈
  - 프로토타입 핫스팟: `70:1222` (`hs/confirm`, x20 y778 362×52) — 이 프레임의 **유일한** 핫스팟
  - 시트 뒤 배경은 S1 홈 프레임의 복제(`67:841`~`67:851`) — 새로 그리는 화면이 아니다
- 모션·딤 스펙: `6. Spec — Motion & Handoff` 페이지 `14:7` (모션 `73:6`, 역반영 목록 `74:7`)
- ai-wiki 근거 문서:
  - `ai-wiki/product/design.md` — "V1.0 최종 확정" 표의 **업데이트 안내** 행, "화면 인벤토리 (V1.0 최종)" U1 항목, 백로그 1번
  - `ai-wiki/product/user-flow.md` — 화면 목록 U1 행("홈 바텀 시트 1회. V1.0에 개발, 기본 비노출 — 노출 조건 제어")
  - `ai-wiki/product/voice-tone.md` — §4 "업데이트 안내 시트 (U1)" 문구 표
  - `ai-wiki/product/policies.md` — §2 계정·데이터(로그인 V1.2 도입 · 익명 계정 병합 · Google/Apple만)
  - `ai-wiki/product/roadmap.md` — V1.0 범위 "U1 업데이트 시트(개발만, 조건 노출)"
  - `ai-wiki/notes/2026-07-26-디자인-반영-인터뷰-6차.md` — U1 결정 원문
- Ownership: `frontend/docs/screen-ownership.md` — `apps/mobile` 소유(앱 셸)
- 담당 앱: `apps/mobile`

Figma가 시각적 SSOT다. 구현 전 `get_design_context`로 `67:853`(시트)과 `67:840`(합성 상태)을 다시 읽고, 절대 좌표를 그대로 옮기지 말고 Flexbox + safe-area로 매핑한다.

## Ownership Boundary

- 이 화면은 **홈 위에 얹히는 오버레이**다. 뒤의 홈 카드·탭바는 이미 `SCR-S1-home.md` 기준으로 구현돼 있다 — U1 작업에서 홈 레이아웃·문구·토큰을 수정하지 않는다(Figma의 `67:841`~`67:851`은 S1의 복제일 뿐, 재구현 대상이 아니다).
- 로그인 UI·계정 병합 로직·스토어 이동은 이 화면의 범위가 아니다. U1은 **안내 문구만** 보여준다. V1.2 범위(S0 로그인)를 이 화면에 끌어들이지 않는다.
- 세션·카메라·WebView(`apps/web`) 영역을 건드리지 않는다.

## Current Figma Structure

```text
U1 · 업데이트 안내 (바텀 시트 · 1회)  [67:840, 402×874]
  ├ (배경) S1 홈 전체 복제  [67:841~67:851 — 상태바·헤더·히어로·시작 CTA·프라이버시 캡션·스탯 2·가이드·탭바·홈 인디케이터]
  ├ dim  [67:852, 402×874, fill rgba(0,0,0,0.6)]   ← 화면 전체 덮음(탭바 포함)
  ├ Sheet / Bottom  [67:853 → 컴포넌트 44:96, x0 y645, 402×229]
  │   bg: bg/base · radius top 24 · padding top 12 / 좌우 20 / bottom 44 · shadow/sheet-up(0 -12 40 black 18%) · gap 8 · 항목 가운데 정렬
  │   ├ handle  [44:89, 36×4, r999, #D1D6DB]        ← 장식(현재 제스처 명세 없음 — Interaction Contract 참고)
  │   ├ text  [44:90, 상단 pad 10, gap 8, 좌측 정렬]
  │   │   ├ 타이틀  [44:91] 19px / lh 23 / Bold / text/primary
  │   │   └ 본문   [44:92] 14px / lh 21 / Regular / text/secondary, 2줄
  │   ├ spacer  [44:95, 10×10]
  │   └ Button / CTA  [44:93, 362×52, r16, bg brand/primary, 라벨 16px/lh19 Bold, text 흰색]
  └ iOS / Home Indicator  [67:861 — 시트 위에 한 번 더 겹쳐 그려짐(OS 크롬, 앱이 직접 그리지 않음)]
```

프레임에 **닫기(X) 버튼·보조 버튼·버전 정보·강제 업데이트 변형이 존재하지 않는다**(직접 확인). `Sheet / Bottom` 컴포넌트에도 variant 속성이 없다 — 단일 형태다.

## Content

`ai-wiki/product/voice-tone.md` §4 "업데이트 안내 시트 (U1)"에서 그대로 인용. Figma 텍스트와 **완전히 일치**함을 확인했다(의역·재작성 금지).

- 타이틀: `로그인이 곧 추가돼요`
- 본문(2줄): `다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요.` / `지금까지의 기록도 로그인하면 계정에 그대로 이어져요.`
- CTA: `확인`

문구 관련 규율:

- 본문 2줄은 Figma에서 `whitespace-nowrap` + `overflow-clip`으로 잡혀 있어 **첫 줄이 402px 폭에서 잘려 보인다**(스크린샷에서 "…로그인할 수 있어" 뒤가 잘림). 이건 Figma 텍스트 레이어 설정 문제이고, **구현에서는 문구 전문이 반드시 다 보여야 한다** — 줄바꿈 허용(clip 금지). 줄바꿈 위치는 폭에 맡기고, 위 문장 경계에서 문단을 나눈다.
- "업데이트"라는 단어가 들어가지만 이 시트는 **앱 버전 업데이트를 강요·유도하는 시트가 아니다.** 스토어 이동 버튼, "지금 업데이트", "나중에" 같은 문구를 추가하지 않는다 — wiki·Figma 어디에도 없다.
- 로그인 제공자는 Google·Apple만 언급한다(`policies.md` §2 — 카카오·네이버 추가 금지).

## Data Contract

이 화면은 **서버 데이터를 소비하지 않는다.** 문구는 전부 정적이며, `packages/types`의 기존 타입(`UserRegisterRequest/Response`, `StudySessionCreateRequest/Response`, `StudySessionSummary`, `StudySessionListResponse`) 중 어느 것도 이 화면에 쓰이지 않는다.

**버전 체크 계약 미확인 — 상상 계약 금지, 플래그만으로 노출 제어.**

- `frontend/packages/types/src/index.ts`에 앱 버전·최소 요구 버전·강제 업데이트 여부·스토어 URL에 해당하는 타입이 **하나도 없다**(직접 확인).
- `ai-wiki` 전체에도 원격 설정(remote config) API, 버전 비교 정책, 강제/선택 업데이트 구분이 **전혀 등장하지 않는다**(`design.md`·`user-flow.md`·`policies.md`·`roadmap.md`·`voice-tone.md`·6차 노트 전수 확인).
- 따라서 `currentVersion` / `minRequiredVersion` / `forceUpdate` / `storeUrl` 같은 필드를 만들어 붙이지 않는다. 버전 비교 로직도 구현하지 않는다. 노출 여부는 아래 "Exposure Control"의 외부 주입 플래그 **하나로만** 결정한다.
- 훗날 원격 설정 기반 버전 체크가 필요해지면 그때 백엔드 계약을 확인하고 별도 스펙으로 추가한다.

로컬 상태(서버 계약 아님):

```ts
// 노출 제어에 필요한 값은 이 둘뿐. packages/types에 export하지 않는다(서버 계약이 아니다).
type UpdateNoticeGate = {
  enabled: boolean; // 외부 주입 플래그. 기본값 false
  seen: boolean; // 기기에 저장된 "이미 봤음" 표시
};
```

## Exposure Control (노출 조건) — 이 화면의 핵심 요구사항

확정 사실(`design.md` · `user-flow.md` · `roadmap.md` · 6차 노트 일치):

1. 노출 위치는 **홈(S1) 위 바텀 시트**다. 다른 탭(기록·설정)·세션 화면에서는 노출하지 않는다.
2. **1회 노출**이다 — 한 번 보고 닫으면 다시 뜨지 않는다.
3. **V1.0 기본값은 비노출**이다. 노출 여부는 외부에서 주입하는 플래그/설정값으로 제어하고, **기본값은 반드시 꺼짐**이다.

구현 규율:

- 플래그는 이 저장소에 이미 있는 외부 설정 주입 경로를 쓴다: `apps/mobile/app.json`의 `expo.extra.*` → `Constants.expoConfig?.extra?.*`(`apps/mobile/lib/userApi.ts`·`statsApi.ts`가 `apiBaseUrl`에 쓰는 것과 동일한 패턴). 키 이름 제안: `extra.updateNoticeEnabled`. **`app.json`에는 `false`로 커밋한다.**
- 값이 없거나(undefined) 파싱 불가면 **꺼짐으로 간주한다**(fail-closed). `enabled === true`일 때만 노출.
- "이미 봤음" 저장은 새 의존성 없이 이미 설치된 `expo-secure-store`를 쓴다(기존 키 네이밍 관례: `focuson.deviceId`, `focuson.userId` → 제안 `focuson.updateNoticeSeen`).
- **강제 업데이트 개념은 존재하지 않는다.** 따라서 "강제일 때 닫기 버튼 숨김" 같은 분기를 만들지 않는다 — Figma에 변형이 없고 wiki에 정의가 없다. 시트는 항상 닫을 수 있고, 닫는 방법은 `확인` CTA다.

## Interaction Contract

| 행동                           | 결과                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 앱 실행 → 홈 진입              | `enabled === true` **그리고** `seen === false`일 때만 시트가 올라온다. 둘 중 하나라도 아니면 아무 일도 일어나지 않는다(딤도 그리지 않는다).                                          |
| `확인` 탭                      | 시트 닫힘 → `seen = true` 저장 → 홈 그대로. 화면 이동·API 호출 없음. (근거: 프레임의 유일한 핫스팟 `70:1222`가 CTA 위에 있다)                                                        |
| 시트가 떠 있는 동안 홈 요소 탭 | **차단**한다. U1 프레임에는 S1·S5·S6 프레임과 달리 탭바 핫스팟(`hs/tab-*`)이 없다 — 딤이 상호작용을 막는 모달이라는 뜻.                                                              |
| 딤 영역 탭으로 닫기            | **미정 — 리더/사용자 확인 필요.** Figma에 핫스팟이 없고 wiki에도 규정이 없다.                                                                                                        |
| 아래로 스와이프해서 닫기       | **미정 — 리더/사용자 확인 필요.** 시트 상단에 핸들(`44:89`)이 있어 사용자는 스와이프를 기대할 수 있지만, 제스처 명세가 어디에도 없다. 핸들 존재만으로 제스처를 임의 확정하지 않는다. |
| Android 하드웨어 백 버튼       | **미정 — 리더/사용자 확인 필요.** (`design.md` 플랫폼 분기 원칙상 앱 UI는 iOS/Android 공통이라 이 화면 자체는 분기가 없지만, 백 버튼 동작은 OS 영역이라 별도 결정이 필요하다.)       |

미정 3건의 구현 지시: **닫기 경로는 `확인` CTA 하나만 실제로 연결하고**, 딤 탭·스와이프·백 버튼은 콜백 자리(prop/핸들러)만 만들어 `// TODO: 닫기 경로 확정 전 — SCR-U1-update-sheet.md Interaction Contract 참고`로 남긴다. 임의로 동작을 켜지 않는다. 단, 어떤 경로로든 닫히게 되는 날을 대비해 "닫힘 처리"와 "seen 저장"은 한 함수로 묶어 둔다(중복 노출 버그 예방).

모션(`6. Spec — Motion & Handoff` `73:6` 실측 스펙 그대로):

- 시트: 하단에서 y-슬라이드 **320ms · cubic-bezier(0.32, 0.72, 0, 1)**
- 딤: fade **250ms**
- (닫힘 모션은 문서에 없다 — 여는 모션의 역재생으로 구현하되, 별도 확정값이 아님을 주석으로 남긴다.)

## Design Tokens Used

`packages/design-tokens/src/index.ts`(2026-07-26 Figma Foundations 동기화 완료본)에 실재하는 키만 나열한다. 모바일은 `apps/mobile/tailwind.config.js`의 대응 클래스를 쓴다(`-dark` 접미사 = 다크 값).

| 용도          | 토큰                                                                           | 모바일 클래스                                       |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 시트 배경     | `colors.bg.base` (#ffffff / #101419)                                           | `bg-bg-base dark:bg-bg-base-dark`                   |
| 타이틀        | `colors.text.primary`                                                          | `text-text-primary dark:text-text-primary-dark`     |
| 본문          | `colors.text.secondary`                                                        | `text-text-secondary dark:text-text-secondary-dark` |
| CTA 배경      | `colors.brand.primary` (#1b64da / #3182f6)                                     | `bg-brand-primary dark:bg-brand-primary-dark`       |
| CTA 라벨      | `colors.text.onBrand` (#ffffff)                                                | `text-text-onBrand`                                 |
| 핸들          | `colors.border.strong` (#d1d6db) — Figma 하드코딩 `#D1D6DB`와 라이트 값이 일치 | `bg-border-strong dark:bg-border-strong-dark`       |
| CTA 반경 16px | `radius.lg`                                                                    | `rounded-lg`                                        |
| 핸들 반경 999 | `radius.full`                                                                  | `rounded-full`                                      |

표준 스케일 밖(실측값 그대로 사용 — 억지로 근사하지 않는다):

- 시트 상단 반경 **24px** (`radius` 스케일에 24 없음: xs4/sm8/md12/lg16/xl20/full)
- 타이틀 **19px / lh 23 / Bold** (heading h3 = 18/26 아님)
- 본문 **14px / lh 21 / Regular** (body sm 13/20 · label md 14/20 Medium 아님)
- CTA 라벨 **16px / lh 19 / Bold** (label lg 16/24 Medium 아님)
- 시트 padding **top 12 / 좌우 20 / bottom 44**, 항목 gap 8, 텍스트 블록 상단 pad 10, spacer 10
- 그림자 `shadow/sheet-up` = **0 -12 40 rgba(0,0,0,0.18)** (Figma Effect Style 등록값)

**딤 값 주의(토큰과 불일치 — 실측값을 쓴다):**

- Figma 실측: `67:852` fill = `rgba(0,0,0,0.6)`. `Sheet / Bottom` 컴포넌트 설명과 Spec 페이지 §4-⑦("시트·다이얼로그 딤 = black 60%")도 60%로 일치한다.
- 반면 시맨틱 토큰 `colors.bg.dim`은 light `#00000066`(40%) / dark `#00000099`(60%)다 — **라이트 모드에서 20%p 차이가 난다.**
- 지시: **라이트·다크 공통으로 `rgba(0,0,0,0.6)`를 쓴다**(Figma가 이 화면의 시각적 SSOT이고, 세 곳(프레임 실측·컴포넌트 설명·Spec 페이지)이 60%로 일치한다). `bg-bg-dim`을 쓰지 말 것. 이 불일치는 아래 Review Checklist에 올려 토큰 정정 여부를 확인받는다.

## Components

- 신규: `apps/mobile/components/UpdateNoticeSheet.tsx` (제안) — Figma `Sheet / Bottom`(`44:96`) 대응. props로 `visible`, `onConfirm`을 받고 **내부에서 플래그를 읽지 않는다**(테스트·재사용 가능하게 순수 프레젠테이션으로).
- 신규: 노출 게이트 로직 — `apps/mobile/lib/updateNotice.ts` (제안). `Constants.expoConfig.extra.updateNoticeEnabled` 읽기 + SecureStore `seen` 읽기/쓰기. 화면 컴포넌트에 게이트 로직을 인라인하지 않는다.
- 마운트 위치: 홈 라우트(`apps/mobile/app/(tabs)/index.tsx`) 안. RN 기본 `Modal`(`transparent`, `animationType="none"` + 직접 애니메이션) 또는 절대배치 오버레이 중 택1 — **새 바텀시트 라이브러리를 설치하지 않는다**(`frontend/CLAUDE.md`: 검증되지 않은 라이브러리 추측 설치 금지). 애니메이션은 이미 설치된 `react-native-reanimated`로 충분하다.
- 재사용: 홈의 기존 컴포넌트(`HeroTodayCard` 등)와 `components/TabBar.tsx`는 **그대로 두고 건드리지 않는다.**
- `Button / CTA`는 S3-8·S4·G1~G5에도 쓰이는 공용 컴포넌트다. 이번에 시트 안에 인라인으로 만들더라도 나중에 공용 승격이 가능하도록 스타일을 한 곳에 모아 둔다(선제 추상화는 하지 않는다).

## Implementation Notes For AI Agents

1. `frontend/CLAUDE.md` → `apps/mobile/CLAUDE.md` → `frontend/docs/screen-ownership.md` → 이 문서 순으로 읽는다.
2. Figma 노드 `67:853`(시트)과 `67:840`(합성)을 `get_design_context`로 재확인한 뒤 시작한다.
3. **기본값 꺼짐을 먼저 구현한다.** 플래그 없이 앱을 실행했을 때 시트가 절대 뜨지 않는 것을 확인한 뒤에 스타일을 다듬는다. `app.json`에 `true`를 커밋하지 않는다.
4. 홈 화면 파일에서 U1 관련 코드는 "게이트 훅 호출 + 조건부 렌더" 몇 줄로 끝나야 한다. 홈의 기존 마크업을 재배치하지 않는다.
5. 하단 padding 44px를 하드코딩하지 말고 `useSafeAreaInsets().bottom`을 반영한다(Figma의 44는 iOS 홈 인디케이터 영역을 포함한 값이고, 프레임에도 홈 인디케이터가 시트 위에 겹쳐 그려져 있다). 최소값으로 44를 하한 삼되 기기 인셋이 더 크면 인셋을 따른다.
6. 문구는 이 문서의 Content를 **문자 그대로** 복사한다. 줄바꿈은 폭에 맡기고 텍스트를 클립하지 않는다(Figma의 nowrap/clip 설정을 따라하지 말 것).
7. 버전 비교·스토어 이동·로그인 관련 코드를 만들지 않는다(Data Contract 참고).
8. 라이트/다크 모두 확인한다(`darkMode: "media"`). 딤은 두 모드 공통 `rgba(0,0,0,0.6)`.
9. 이 화면에는 아이콘·일러스트 에셋이 없다 — 새 SVG를 그리거나 내보내지 않는다.
10. `apps/web`, 세션 로직, 카메라 코드를 건드리지 않는다. V1.2+ 화면(S0 로그인, S7~S11)을 추가하지 않는다.

## Accessibility Requirements

- CTA 터치 영역 52px 높이 — 44px 최소 기준 충족(그대로 유지, 축소 금지).
- 시트는 모달이다: 열려 있는 동안 뒤 홈 콘텐츠는 스크린리더 포커스에서 제외한다(RN `accessibilityViewIsModal` / `importantForAccessibility="no-hide-descendants"`). 딤은 장식이므로 `accessible={false}`.
- 시트가 열릴 때 타이틀이 먼저 읽히도록 한다(`accessibilityRole="header"` 또는 열림 시 포커스 지정).
- 핸들(36×4)은 순수 장식 — 스크린리더에 노출하지 않는다. 현재 제스처가 연결돼 있지 않으므로 "끌어서 닫기"로 안내하지 않는다.
- 폰트 확대 시 타이틀·본문이 잘리지 않아야 한다. 시트 높이 229px는 Figma 기준 고정값이 아니라 **콘텐츠에 따라 늘어나는 값**으로 구현한다(높이 하드코딩 금지). 본문이 3줄 이상으로 늘어나도 CTA가 화면 밖으로 밀리지 않게 한다.
- 색상 단독 전달 없음(문구+버튼 라벨로 의미 전달) — 추가 조치 불필요.

## Current Limitations

- **기본 비노출이라 앱을 그냥 실행하면 이 화면을 볼 수 없다.** QA·리뷰 시에는 `app.json`의 플래그를 임시로 켜고 확인한 뒤 **반드시 되돌린다**(커밋 전 `false` 확인).
- 닫기 경로가 `확인` CTA 하나뿐이다(딤 탭·스와이프·백 버튼 미정). 미정 항목이 확정되기 전까지 사용자는 CTA로만 닫을 수 있다.
- "1회 노출"의 **재노출 기준이 미정**이다 — 앱 재설치 시 다시 뜨는 것은 SecureStore 특성상 자연스럽지만, "플래그를 껐다가 다른 공지로 다시 켰을 때" 같은 케이스는 정의돼 있지 않다(공지 ID 개념이 wiki에 없다). 현재는 단일 boolean으로 구현하고, 공지 ID 도입 여부는 확인 대상이다.
- 노출 타이밍의 세부(홈 진입 즉시인지, 첫 렌더 후 약간의 지연을 두는지)가 문서화돼 있지 않다. Figma 프레임은 홈 초기 상태 위에 떠 있으므로 "홈 진입 직후"로 구현하되, 지연값은 임의 확정하지 않는다.
- 닫힘 모션 값이 Spec 페이지에 없다(여는 값만 존재).
- Android 프레임이 없다(`4. Screens — Android` 페이지는 비어 있음) — `design.md` 플랫폼 분기 원칙에 따라 앱 UI는 공통이므로 iOS 프레임을 그대로 쓴다. 단 하단 인셋·백 버튼은 위 미정 항목 참고.

## Review Checklist

- [ ] 노출 플래그의 최종 이름·주입 경로 확정 (`app.json extra.updateNoticeEnabled` 제안 — 원격 설정으로 갈 계획이 있는지 포함해 확인)
- [ ] 닫기 경로 확정: 딤 탭 / 아래로 스와이프 / Android 백 버튼을 허용할지 (현재 전부 **미정**, CTA만 연결)
- [ ] "1회 노출"의 재노출 기준 확정 — 단일 boolean인지, 공지 ID 단위인지 (앱 재설치·플래그 재활성 케이스)
- [ ] **`seen` 조회 실패 시 노출 방향 확정** — 현재 구현은 fail-closed(비노출, `apps/mobile/lib/updateNotice.ts`의 `shouldShowUpdateNotice` catch)지만 스펙 미규정 상태에서 빌더가 자체 판단한 것이다. Exposure Control의 fail-closed 규정은 **플래그 파싱**에만 적용되고 저장소 조회 실패는 다루지 않았다. 확정되면 그 `catch` 하나만 바꾸면 된다(반대 방향인 `onboardingGuideStore`의 fail-open과 대비 관계).
- [ ] 노출 타이밍(홈 진입 즉시 vs 지연) 확정
- [ ] **딤 불투명도 불일치 정리** — Figma 실측·컴포넌트 설명·Spec 페이지는 60%인데 시맨틱 토큰 `bg/dim`의 라이트 값은 40%(#00000066)다. 토큰을 60%로 정정할지, 시트·다이얼로그 전용 딤 토큰을 신설할지 결정 필요(같은 문제가 S3-7 종료 확인 다이얼로그에도 적용된다)
- [ ] **Figma 시트 본문 텍스트 클립 수정 요청** — `44:92`가 nowrap+clip이라 첫 줄이 잘려 보인다. 구현은 전문을 표시하지만, Figma 원본도 고쳐두지 않으면 다음 리뷰·QA에서 같은 혼동이 반복된다
- [ ] 시트 상단 반경 24px / 타이틀 19px / 본문 14px Regular가 디자인 시스템 표준 스케일에 흡수될 값인지 확인(현재는 실측값 사용)
- [ ] 닫힘 모션 값 확정(현재는 여는 모션의 역재생)
