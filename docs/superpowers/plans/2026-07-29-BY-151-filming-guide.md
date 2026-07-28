# BY-151 촬영 가이드 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 온보딩 가이드(G1~G5)를 촬영가이드로 재정의한다 — 카메라 목업 장식을 걷어내 검정 단색 배경으로 바꾸고, 우측 상단 X(나가기) 경로를 추가하며, 재진입 CTA "닫기만"을 확정으로 승격한다.

**Architecture:** 화면 신설 없음. `OnboardingGuideFlow`(플로우 컴포넌트)·`onboarding-guide.tsx`(라우트)·`focusStartFlow.ts`(오케스트레이션)의 기존 3층 구조를 유지한 채 최소 수정. X는 기존 `onFinish`(완료·건너뛰기 → A 경로에서 세션 시작)와 **분리된 별도 종료 경로(`onExit`)** — 어느 진입 경로에서든 봤음 저장 후 화면 복귀만 한다. 근거: BY-151 티켓(2026-07-28 그릴링 확정 8건, 티켓 코멘트 참고).

**Tech Stack:** Expo RN(expo-router) · jest + @testing-library/react-native · 새 의존성 없음

## Global Constraints

- pnpm 고정, **새 의존성 추가 금지**.
- TypeScript strict. 타입 전용 import는 `import type`.
- 커밋: 기본 Conventional 타입, **subject 한글 시작**(commitlint subject-case), 키는 끝에 `(BY-151)`.
- **커밋은 의미 단위로**: 백드롭 단색화 1커밋, X 나가기(lib+UI+라우트+테스트) 1커밋.
- 기존 확정 사항 불변: 완료·건너뛰기 → `continueAfterOnboardingGuide`(A 경로에서 권한 게이트→세션) 로직은 **건드리지 않는다**. G1~G5 콘텐츠(문구·타이머·필·컨트롤 바 교육 요소)도 유지 — 제거 대상은 배경 **장식**(사선 밴드·프리뷰 라벨)뿐.
- 촬영 세팅(각도/거리/조명) 페이지·재진입 CTA 문구 변경은 범위 밖(디자인 후속) — 구현하지 않는다.
- 모든 명령은 워크트리 루트(`worktrees/fe-by-151`)에서 실행.

---

### Task 1: 가이드 배경 검정 단색화

**Files:**

- Modify: `apps/mobile/components/onboarding/SessionMockBackdrop.tsx` (`MockBaseLayer`)
- Test(영향 수정): `apps/mobile/__tests__/onboarding-guide.test.tsx` 등 프리뷰 라벨을 단언하는 기존 테스트

**Interfaces:**

- Consumes: `coachOverlay.mockCameraBg`(#1A2029)·`mockSimpleBg`(#0B0F14) — 이미 검정 계열, 그대로 유지
- Produces: 장식 없는 단색 `MockBaseLayer` (시그니처 불변 — `{ base }` prop 유지)

- [ ] **Step 1: 기존 테스트에서 프리뷰 라벨/장식 의존 확인**

Run: `cd apps/mobile && npx grep 필요 없음 — Grep으로 "전 면 카 메 라" 검색` 후, 라벨 존재를 단언하는 테스트가 있으면 "부재 단언"으로 뒤집는다(TDD: 먼저 뒤집어 RED 확인).

```bash
grep -rn "전 면 카 메 라" apps/mobile
```

- [ ] **Step 2: 라벨 부재 테스트 작성/수정 후 실패 확인**

`apps/mobile/__tests__/onboarding-guide.test.tsx`에 (없으면 추가):

```tsx
it("배경은 검정 단색이다 — 카메라 프리뷰 목업 라벨을 그리지 않는다 (BY-151 재정의)", () => {
  render(<OnboardingGuideScreen />); // 파일의 기존 렌더 헬퍼/설정을 따른다
  expect(screen.queryByText(/전 면 카 메 라/)).toBeNull();
});
```

Run: `pnpm --filter mobile test -- onboarding-guide`
Expected: FAIL (라벨이 아직 렌더됨)

- [ ] **Step 3: `MockBaseLayer` 장식 제거**

`SessionMockBackdrop.tsx`의 `MockBaseLayer`에서 `base === "camera"` 분기 내부의 **사선 밴드(STRIPE_COUNT 루프)와 "[ 전 면 카 메 라 프 리 뷰 ]" 라벨 렌더를 통째로 제거**하고, 배경색만 남긴다:

```tsx
export function MockBaseLayer({ base }: { base: MockBackdrop["base"] }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor:
            base === "simple" ? coachOverlay.mockSimpleBg : coachOverlay.mockCameraBg,
        },
      ]}
    />
  );
}
```

`STRIPE_COUNT` 상수·미사용 토큰 참조(`mockStripe`·`mockPreviewLabel`)가 이 파일에서 더 이상 안 쓰이면 함께 정리한다(coachOverlayTheme의 토큰 정의 자체는 남겨도 무방 — 다른 참조가 없을 때만 제거). 파일 상단 doc 주석의 "카메라 프리뷰 목업" 서술을 "검정 단색 배경(BY-151 촬영가이드 재정의, 2026-07-28 팀 확정 — 카메라 흉내 장식 제거)"로 갱신한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- onboarding-guide onboardingGuide`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/components/onboarding/SessionMockBackdrop.tsx apps/mobile/__tests__/onboarding-guide.test.tsx
git commit -m "feat(onboarding): 가이드 배경 검정 단색화 — 카메라 목업 장식 제거 (BY-151)"
```

(coachOverlayTheme.ts를 수정했다면 add에 포함)

---

### Task 2: X(나가기) 경로 추가 + 재진입 닫기 확정

**Files:**

- Modify: `apps/mobile/lib/focusStartFlow.ts` (`exitOnboardingGuide` 추가, 재진입 TODO 확정 주석화)
- Modify: `apps/mobile/components/onboarding/coachIcons.tsx` (`IconClose` 추가 — X 모양)
- Modify: `apps/mobile/components/onboarding/OnboardingGuideFlow.tsx` (`onExit` prop + 우상단 X 버튼)
- Modify: `apps/mobile/app/onboarding-guide.tsx` (onExit 배선)
- Test: `apps/mobile/lib/__tests__/focusStartFlow.test.ts` · `apps/mobile/__tests__/onboarding-guide.test.tsx`

**Interfaces:**

- Consumes: `markOnboardingGuideSeen()`(멱등, 기존) · `IconExit`와 같은 `SvgProps` 패턴(coachIcons 기존)
- Produces:
  - `exitOnboardingGuide(): Promise<void>` — 봤음 저장만, 세션 시작 없음
  - `OnboardingGuideFlow`의 새 prop `onExit: () => void`

- [ ] **Step 1: lib 실패 테스트 작성** — `focusStartFlow.test.ts`에 추가 (파일의 기존 mock 패턴을 따른다):

```ts
describe("exitOnboardingGuide", () => {
  it("봤음을 저장하고 권한 게이트·세션 시작은 호출하지 않는다", async () => {
    await exitOnboardingGuide();
    expect(mockedMarkSeen).toHaveBeenCalledTimes(1); // 파일의 기존 mock 이름 사용
    // 권한 게이트 mock(runCameraPermissionGate 등)이 호출되지 않았음을 함께 단언
  });
});
```

Run: `pnpm --filter mobile test -- focusStartFlow`
Expected: FAIL — `exitOnboardingGuide is not a function`

- [ ] **Step 2: lib 구현** — `focusStartFlow.ts`에 추가:

```ts
/**
 * X(나가기)로 가이드를 닫았을 때의 처리 (2026-07-28 확정, BY-151).
 *
 * 세션을 시작하지 않는다 — 완료·건너뛰기(`continueAfterOnboardingGuide`)와 분리된 경로다.
 * 봤음 저장은 단일 규칙("가이드가 어떤 이유로든 닫히면 봤음")을 따른다 — 진입 경로 무관,
 * 멱등. 다시 보고 싶으면 홈 가이드 카드·설정 재진입 경로가 있다. 화면 복귀는 호출부가 한다.
 */
export async function exitOnboardingGuide(): Promise<void> {
  await markOnboardingGuideSeen();
}
```

같은 파일 `continueAfterOnboardingGuide`의 재진입 TODO 주석(⚠️ 진입 경로 B·C… ~ TODO 줄)을 확정 주석으로 교체:

```ts
// 재진입(홈 가이드 카드 · 설정 측정 기준 안내)에서는 CTA를 눌러도 세션을 시작하지 않고
// 가이드만 닫는다 — 2026-07-28 확정(BY-151). 세션 시작은 집중 시작 플로우(focus-start)에서만.
// 근거: 설정·카드 진입은 "열람" 맥락이라 시작 부수효과가 부적합하다는 팀 판단.
```

Run: `pnpm --filter mobile test -- focusStartFlow` → PASS

- [ ] **Step 3: `IconClose` 추가** — `coachIcons.tsx`에 기존 `IconExit`와 같은 `SvgProps` 패턴으로 X 모양 아이콘:

```tsx
/** 우상단 나가기 X (BY-151). 획 색·두께는 IconExit의 화이트 스트로크 관례를 따른다. */
export function IconClose({ width = 19, height = 19, ...rest }: SvgProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 19 19" fill="none" {...rest}>
      <Path
        d="M4.75 4.75L14.25 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
      <Path
        d="M14.25 4.75L4.75 14.25"
        stroke="#FFFFFF"
        strokeWidth={1.58333}
        strokeLinecap="round"
      />
    </Svg>
  );
}
```

- [ ] **Step 4: 화면 실패 테스트 작성** — `__tests__/onboarding-guide.test.tsx`에 추가 (파일 기존 렌더·mock 설정 재사용):

```tsx
it("우상단 X로 나가면 봤음만 저장하고 세션·권한 게이트로 이어지지 않는다", async () => {
  render(<OnboardingGuideScreen />);
  fireEvent.press(screen.getByRole("button", { name: "가이드 닫기" }));
  await waitFor(() => expect(mockedMarkSeen).toHaveBeenCalled()); // 파일의 저장 mock 이름 사용
  // 권한 게이트/세션 시작 경로 미호출 단언 (기존 테스트가 쓰는 mock으로)
});
```

Run: `pnpm --filter mobile test -- onboarding-guide`
Expected: FAIL — "가이드 닫기" 버튼 없음

- [ ] **Step 5: `OnboardingGuideFlow`에 X 버튼** — prop 추가 및 렌더 (최상위 View의 마지막 자식으로 — 탭 레이어·하단 내비보다 뒤에 선언되어 z-순서상 위):

```tsx
export function OnboardingGuideFlow({
  onFinish,
  onExit,
}: {
  /** 완료·건너뛰기 **둘 다** 여기로 나온다 — 이후 동작은 호출부(플로우 오케스트레이션)가 정한다. */
  onFinish: (reason: OnboardingGuideExitReason) => void;
  /** 우상단 X(나가기) — 세션으로 이어지지 않는 별도 종료 경로(2026-07-28 확정, BY-151). */
  onExit: () => void;
}) {
```

렌더(마지막 자식, 기존 `</View>` 직전):

```tsx
{
  /* 우상단 나가기 — 건너뛰기(생략하고 진행)와 반대 방향의 별도 동작이라 위치도 분리한다. */
}
<Pressable
  onPress={onExit}
  accessibilityRole="button"
  accessibilityLabel="가이드 닫기"
  hitSlop={8}
  style={{
    position: "absolute",
    top: insets.top + 13,
    right: 20,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  }}
>
  <IconClose />
</Pressable>;
```

(`IconClose` import 추가. 44×44는 최소 터치 타깃 관례.)

- [ ] **Step 6: 라우트 배선** — `app/onboarding-guide.tsx`:

```tsx
import { continueAfterOnboardingGuide, exitOnboardingGuide } from "../lib/focusStartFlow";

/** X 나가기 — 봤음 저장 후 복귀만. 세션 플로우로 이어지지 않는다(2026-07-28 확정). */
const handleExit = useCallback(() => {
  closeGuide();
  void exitOnboardingGuide().catch((error: unknown) => {
    // 저장 실패는 다음 진입 시 가이드가 한 번 더 뜨는 정도라 치명적이지 않다 — 복귀는 이미 끝났다.
    console.warn("[onboarding-guide] 나가기 처리 실패", error);
  });
}, [closeGuide]);
```

`<OnboardingGuideFlow onFinish={handleFinish} onExit={handleExit} />`로 교체. 시스템 뒤로가기 TODO 주석은 유지하되 한 줄 추가: "X 나가기(BY-151)가 생겨 하드웨어 백을 X와 동일 처리하는 선택지가 유력해졌으나 여전히 미확정."

- [ ] **Step 7: 전체 통과 확인**

Run: `pnpm --filter mobile test -- onboarding-guide focusStartFlow`
Expected: PASS 전부 (기존 단언 포함)

- [ ] **Step 8: 커밋**

```bash
git add apps/mobile/lib/focusStartFlow.ts apps/mobile/lib/__tests__/focusStartFlow.test.ts apps/mobile/components/onboarding/coachIcons.tsx apps/mobile/components/onboarding/OnboardingGuideFlow.tsx apps/mobile/app/onboarding-guide.tsx apps/mobile/__tests__/onboarding-guide.test.tsx
git commit -m "feat(onboarding): 가이드 우상단 X 나가기 추가·재진입 닫기 확정 (BY-151)"
```

---

### Task 3: 전체 검증

**Files:** 없음

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test` (루트) — 전부 PASS. 실패 시 수정 후 fix 커밋.
- [ ] **Step 2 (선택):** Expo Go 확인 — 가이드 배경이 단색 검정인지, X로 나가면 홈 복귀 + 다음 '집중 시작'에서 가이드 생략되는지, 설정·홈 카드 재진입에서 CTA가 닫기만 하는지.

---

### Task 4: PR·완료 처리

**Files:** 없음 (git/GitHub/Jira)

- [ ] **Step 1:** Jira BY-151을 "진행 중"으로 전환(이미 전환돼 있으면 생략).
- [ ] **Step 2:** 푸시 + PR 생성 — base `dev`, 제목 `[feat] BY-151 촬영 가이드 화면`, 본문은 `.github/pull_request_template.md` 체크리스트 + 그릴링 확정 8건 요약 링크(티켓 코멘트). 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3:** 리뷰(자동 리뷰 코멘트 대응) → 머지(사용자) → Jira "완료" 전환 + PR 링크 코멘트.

## Self-Review 결과 (작성 시 수행)

- 티켓 완료 조건 대비: 배경 단색화(Task 1) · X 신설+onExit 분리(Task 2) · 재진입 닫기 확정(Task 2 Step 2) · 봤음 단일 규칙(Task 2) · 콘텐츠/권한/건너뛰기 불변(Global Constraints) · 테스트+검증(각 Task, Task 3) 모두 대응.
- 범위 밖 항목(촬영 세팅 페이지·CTA 문구·웹뷰 세션 라우트) 계획에 미포함 확인.
- 타입 일관성: `onExit: () => void`·`exitOnboardingGuide(): Promise<void>` 정의(Task 2 Step 2·5)와 사용처(Step 6) 일치.
