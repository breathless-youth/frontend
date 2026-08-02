# SCRUM-172 연속 공부일(스트릭) 조회 API 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/stats/streak?userId={userId}`를 연동해 현재/최장 연속 공부일을 조회하고, 홈 탭 임시 UI로 Expo Go에서 실동작을 확인할 수 있게 한다.

**Architecture:** 기존 `apps/mobile/lib/statsApi.ts`(SCRUM-171)에 함수 하나를 추가하는 최소 변경. 타입은 `packages/types`에 Swagger 계약 그대로 추가. 홈 탭에 임시 확인용 Text 한 줄.

**Tech Stack:** Expo RN(expo-router), Jest, pnpm + Turborepo.

## Global Constraints

- 작업 위치: 워크트리 `C:/Users/wonza/Desktop/Wonil/projects/focuson/fe-scrum-172`, 브랜치 `feature/SCRUM-172-FE-연속-공부일-스트릭-조회-API-연동`
- 백엔드 Swagger에 없는 필드/타입을 만들지 않는다 (응답은 `{ streak, maxStreak }` 둘뿐)
- TypeScript strict, 타입 전용 import는 `import type`
- 커밋은 Conventional Commits 기본 타입만 (`feat`/`fix`/`docs`/`chore` 등) — commitlint가 강제
- 테스트 설명·주석은 기존 파일처럼 한국어
- 스펙: `docs/superpowers/specs/2026-07-26-scrum-172-streak-api-design.md`

---

### Task 1: 스트릭 계약 타입 + `getStreak` API 함수 (TDD)

**Files:**

- Modify: `packages/types/src/index.ts` (파일 끝에 추가)
- Modify: `apps/mobile/lib/statsApi.ts` (파일 끝에 추가)
- Test: `apps/mobile/lib/__tests__/statsApi.test.ts` (기존 describe 아래에 추가)

**Interfaces:**

- Consumes: `apiBaseUrl()` — `statsApi.ts`에 이미 있는 내부 헬퍼 (`http://api.test` 형태 base URL 반환)
- Produces: `getStreak(userId: number): Promise<StudySessionStreakResponse>` — Task 2가 import해서 사용. `StudySessionStreakResponse { streak: number; maxStreak: number }` — `@focuson/types`에서 export.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/statsApi.test.ts` — 맨 위 import를 수정하고, 파일 끝에 describe 블록 추가:

```ts
// 기존: import { listStudySessionStats } from "../statsApi";
import { getStreak, listStudySessionStats } from "../statsApi";
```

```ts
describe("getStreak", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("userId로 현재/최장 스트릭을 조회한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { streak: 5, maxStreak: 12 }));

    await expect(getStreak(7)).resolves.toEqual({ streak: 5, maxStreak: 12 });
    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/stats/streak?userId=7", {
      method: "GET",
    });
  });

  it("기록이 없으면 0/0 응답을 그대로 반환한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { streak: 0, maxStreak: 0 }));

    await expect(getStreak(7)).resolves.toEqual({ streak: 0, maxStreak: 0 });
  });

  it("JSON 오류 메시지가 있으면 해당 메시지로 실패한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { message: "userId는 필수입니다" }));

    await expect(getStreak(7)).rejects.toThrow("userId는 필수입니다");
  });

  it("JSON 오류 본문을 읽지 못하면 HTTP 상태를 포함해 실패한다", async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(getStreak(7)).rejects.toThrow("스트릭 조회 실패 (HTTP 500)");
  });
});
```

(`mockedFetch`/`jsonResponse`는 파일 상단에 이미 정의돼 있다 — 재정의 금지.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter mobile test -- statsApi`
Expected: FAIL — `getStreak`가 export되지 않아 컴파일/참조 오류

- [ ] **Step 3: 타입 + 최소 구현**

`packages/types/src/index.ts` 파일 끝에 추가:

```ts
/**
 * 연속 공부일(스트릭) 조회 API 계약 (GET /api/stats/streak) — Swagger 기준.
 * 서버가 세션 이력에서 매번 계산한다. 기록/유저 없음이면 둘 다 0.
 */
export interface StudySessionStreakResponse {
  /** 현재 연속 공부일 — 오늘 기록이 없어도 어제까지 이어졌으면 유지 중으로 본다 */
  streak: number;
  /** 역대 최장 연속 공부일 */
  maxStreak: number;
}
```

`apps/mobile/lib/statsApi.ts` — import 수정 후 파일 끝에 추가:

```ts
// 기존: import type { StudySessionListResponse } from "@focuson/types";
import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";
```

```ts
export async function getStreak(userId: number): Promise<StudySessionStreakResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/stats/streak?userId=${userId}`, {
    method: "GET",
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `스트릭 조회 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionStreakResponse;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter mobile test -- statsApi`
Expected: PASS (기존 listStudySessionStats 테스트 포함 전부)

Run: `pnpm typecheck`
Expected: 전 패키지 통과

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts apps/mobile/lib/statsApi.ts apps/mobile/lib/__tests__/statsApi.test.ts
git commit -m "feat(mobile): 연속 공부일(스트릭) 조회 API 연동 (SCRUM-172)"
```

---

### Task 2: 홈 탭 임시 확인용 UI + Expo Go 검증

**Files:**

- Modify: `apps/mobile/app/(tabs)/index.tsx` (전체 교체 — 아래 코드)

**Interfaces:**

- Consumes: `getStreak(userId)` (Task 1), `ensureUserRegistered(): Promise<number | null>` (`apps/mobile/lib/userApi.ts` — 멱등, 실패 시 null)
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 임시 UI 구현**

`apps/mobile/app/(tabs)/index.tsx` 전체를 다음으로 교체:

```tsx
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { StudySessionStreakResponse } from "@focuson/types";

import { getStreak } from "../../lib/statsApi";
import { ensureUserRegistered } from "../../lib/userApi";

export default function HomeScreen() {
  // 임시 확인용 — 확정 디자인 화면 나오면 교체 (SCRUM-172)
  const [streak, setStreak] = useState<StudySessionStreakResponse | null>(null);

  useEffect(() => {
    void (async () => {
      const userId = await ensureUserRegistered();
      if (userId == null) return;
      try {
        const result = await getStreak(userId);
        console.log("[streak] 조회 성공:", result);
        setStreak(result);
      } catch (error) {
        console.warn("[streak] 조회 실패", error);
      }
    })();
  }, []);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-xl font-semibold">FocusOn</Text>
      <Text className="text-sm text-gray-500">AI 비전 기반 순공 시간 측정 캠스터디</Text>
      {streak ? (
        <Text className="text-sm text-orange-500">
          🔥 연속 {streak.streak}일 · 최장 {streak.maxStreak}일
        </Text>
      ) : null}
    </View>
  );
}
```

로딩/에러 UI는 만들지 않는다 — 실패 시 콘솔 경고만 남기고 Text 미표시(스펙 범위 밖).

- [ ] **Step 2: 정적 검증**

Run: `pnpm typecheck` 그리고 `pnpm --filter mobile lint`
Expected: 통과

- [ ] **Step 3: Expo Go 실동작 확인**

Run: `pnpm --filter mobile dev` → 실기기 Expo Go로 접속
Expected:

- 콘솔에 `[streak] 조회 성공: { streak: N, maxStreak: M }` 로그
- 홈 탭에 "🔥 연속 N일 · 최장 M일" Text 표시 (서버 목데이터 시딩 기준 0 이상 값)

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat(mobile): 홈 탭 스트릭 임시 확인 UI 추가 (SCRUM-172)"
```
