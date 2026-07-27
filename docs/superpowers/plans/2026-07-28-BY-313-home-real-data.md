# BY-313 홈(S1) 실데이터 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈(S1)의 통계 영역(오늘 순공·총 공부·집중률·연속 공부·최장 집중)을 `MOCK_SUMMARY` 대신 실제 서버 통계(`GET /api/stats`, `GET /api/stats/streak`)로 표시한다.

**Architecture:** TanStack Query를 도입해 서버 상태를 관리한다. 층위는 3단 — ① `lib/statsQueries.ts`에 queryOptions(queryKey·queryFn)를 **순수 정의**로 두고(추후 BY-291 제출 후 invalidate·BY-314~316 재사용의 SSOT), ② `components/home/useHomeSummary.ts` 조합 훅이 userId 확보 → stats·streak 의존 쿼리 → 화면 모델 매핑을 담당하고, ③ 화면(`app/(tabs)/index.tsx`)은 훅의 상태(pending/error/success)만 렌더한다. 로딩·오류 UI는 새 `components/ui/`(자체 프리미티브 레이어, 외부 라이브러리 없음)에 둔다.

**Tech Stack:** Expo RN(expo-router) · @tanstack/react-query(신규 설치) · NativeWind · jest-expo + @testing-library/react-native

## Global Constraints

- 작업 위치: `c:\Users\wonza\Desktop\Wonil\projects\focuson\worktrees\fe-by-313` — **이 워크트리 밖 파일 수정 금지**
- TypeScript strict, `any` 금지, 타입 전용 import는 `import type`
- 스타일은 NativeWind `className` 우선 (`StyleSheet.create`는 NativeWind로 안 되는 경우만)
- 시간 텍스트는 **분 단위만** (초 금지 — 위키 2026-07-27 확정). 라이브 타이머는 이 화면에 없음
- 스트릭은 서버 값 그대로 (로컬 합산·보정 금지)
- 서버 계약 타입은 `@focuson/types`에 있는 것만 사용 (상상 계약 금지)
- 커밋: `feat(home): 제목 (BY-313)` 형식, commitlint 기본 타입만. **push·merge 금지** (커밋까지만)
- 새 의존성은 `@tanstack/react-query` 하나만. date-fns는 BY-314에서 첫 사용처와 함께 설치 (이 티켓에서 사용처 없음)
- `apps/mobile/CLAUDE.md` 수정 금지 — `docs/wiki-ssot-alignment` 브랜치가 같은 파일을 전면 개정 중 (충돌 방지, 구조 규칙 문서화는 그 브랜치에서)
- 각 태스크 종료 시 `pnpm --filter mobile test` 통과 확인 후 커밋

---

### Task 1: TanStack Query 설치 + QueryClientProvider 배선

**Files:**

- Modify: `apps/mobile/package.json` (pnpm으로 설치)
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**

- Produces: 앱 전역 `QueryClientProvider` (이후 모든 훅 태스크의 전제). AppState → `focusManager` 배선(앱 포그라운드 복귀 시 stale 쿼리 자동 재조회).

- [ ] **Step 1: 의존성 설치**

```bash
cd c:/Users/wonza/Desktop/Wonil/projects/focuson/worktrees/fe-by-313
pnpm --filter mobile add @tanstack/react-query
```

- [ ] **Step 2: 기존 테스트가 여전히 통과하는지 확인**

Run: `pnpm --filter mobile test`
Expected: PASS (설치만으로 깨지는 것 없음)

- [ ] **Step 3: `_layout.tsx`에 Provider·focusManager 배선**

`app/_layout.tsx`를 다음으로 교체:

```tsx
import "../global.css";

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureUserRegistered } from "../lib/userApi";

/**
 * 서버 통계는 홈·기록 탭이 공유한다. staleTime 30초: 탭을 오가는 짧은 간격에는 캐시를
 * 쓰고, 그보다 오래되면 포커스 시 재조회한다. retry 1: 오류 UI에 재시도 버튼이 있으므로
 * 자동 재시도를 길게 끌지 않는다.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  useEffect(() => {
    void ensureUserRegistered();
  }, []);

  // RN에는 window focus가 없다 — 앱 포그라운드 복귀를 react-query의 focus 신호로 잇는다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          {/* S2-3 권한 거부 안내 — 탭 위에 올라오는 전체 화면. 백 제스처를 막지 않는다(홈 복귀와 동일 결과). */}
          <Stack.Screen name="permission-denied" />
          {/*
            G1~G5 온보딩 가이드 — 5스텝 전체가 이 라우트 하나다(스텝은 화면이 아니라 상태).
            탭 바를 가리는 전체 화면 모달로 띄운다: 배경이 세션 화면 목업이라 탭 바가 함께
            보이면 "지금 세션 화면"이라는 착시가 깨진다. 백 제스처는 막지 않는다 —
            시스템 뒤로가기 처리는 아직 미정이라 플랫폼 기본값을 그대로 둔다
            (`app/onboarding-guide.tsx`의 TODO 참고).
          */}
          <Stack.Screen
            name="onboarding-guide"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

(기존 주석 블록은 유지한다 — 위 코드에 이미 포함되어 있다. `room/[id]` 관련 안내 주석이 원본에 있으면 그대로 둔다.)

- [ ] **Step 4: lint·typecheck·test 확인**

Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app/_layout.tsx
git commit -m "feat(home): TanStack Query 도입 및 앱 루트 Provider 배선 (BY-313)"
```

---

### Task 2: KST 오늘 날짜 키 유틸

**Files:**

- Create: `apps/mobile/lib/dateKst.ts`
- Test: `apps/mobile/lib/__tests__/dateKst.test.ts`

**Interfaces:**

- Produces: `todayKstDateKey(now?: Date): string` — `YYYY-MM-DD`(KST 기준). Task 4의 훅이 `GET /api/stats`의 `date` 파라미터로 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/dateKst.test.ts`:

```ts
import { todayKstDateKey } from "../dateKst";

describe("todayKstDateKey", () => {
  it("UTC 자정 직전이라도 KST 기준 날짜를 돌려준다", () => {
    // 2026-07-27T16:00:00Z = KST 2026-07-28 01:00
    expect(todayKstDateKey(new Date("2026-07-27T16:00:00Z"))).toBe("2026-07-28");
  });

  it("KST 자정 직전은 같은 날로 남는다", () => {
    // 2026-07-27T14:59:59Z = KST 2026-07-27 23:59:59
    expect(todayKstDateKey(new Date("2026-07-27T14:59:59Z"))).toBe("2026-07-27");
  });

  it("월·일이 한 자리면 0을 채운다", () => {
    expect(todayKstDateKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- dateKst`
Expected: FAIL — `Cannot find module '../dateKst'`

- [ ] **Step 3: 구현**

`apps/mobile/lib/dateKst.ts`:

```ts
/**
 * 서버 통계 귀속 날짜(statDate)는 KST 기준이다(위키 서버 전송 계약).
 * 기기 시간대와 무관하게 KST 날짜 키를 만든다 — UTC+9를 더한 뒤 UTC 게터로 읽는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayKstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${month}-${day}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- dateKst`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/dateKst.ts apps/mobile/lib/__tests__/dateKst.test.ts
git commit -m "feat(home): KST 오늘 날짜 키 유틸 추가 (BY-313)"
```

---

### Task 3: statsQueries — queryOptions 순수 정의

**Files:**

- Create: `apps/mobile/lib/statsQueries.ts`
- Test: `apps/mobile/lib/__tests__/statsQueries.test.ts`

**Interfaces:**

- Consumes: `listStudySessionStats(userId: number, date: string)` · `getStreak(userId: number)` (`lib/statsApi.ts`), `ensureUserRegistered(): Promise<number | null>` (`lib/userApi.ts`)
- Produces:
  - `statsKeys.all: readonly ["stats"]` — BY-291 제출 후 `invalidateQueries({ queryKey: statsKeys.all })`의 기준 키
  - `dailyStatsQuery(userId: number, date: string)` — queryOptions, data는 `StudySessionListResponse`
  - `streakQuery(userId: number)` — queryOptions, data는 `StudySessionStreakResponse`
  - `registeredUserIdQuery()` — queryOptions, data는 `number`. 등록 실패(null) 시 **throw** (react-query 오류 경로·재시도 활용)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/statsQueries.test.ts`:

```ts
import { dailyStatsQuery, registeredUserIdQuery, statsKeys, streakQuery } from "../statsQueries";

jest.mock("../statsApi", () => ({
  listStudySessionStats: jest.fn().mockResolvedValue({ totalStudySec: 1 }),
  getStreak: jest.fn().mockResolvedValue({ streak: 2, maxStreak: 3 }),
}));
jest.mock("../userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));

import { getStreak, listStudySessionStats } from "../statsApi";
import { ensureUserRegistered } from "../userApi";

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;

describe("statsKeys", () => {
  it("일일·스트릭 키는 stats 루트 키를 공유한다 (일괄 invalidate 대상)", () => {
    expect(dailyStatsQuery(7, "2026-07-28").queryKey[0]).toBe(statsKeys.all[0]);
    expect(streakQuery(7).queryKey[0]).toBe(statsKeys.all[0]);
  });

  it("userId·날짜가 다르면 키도 다르다", () => {
    expect(dailyStatsQuery(7, "2026-07-28").queryKey).not.toEqual(
      dailyStatsQuery(7, "2026-07-27").queryKey,
    );
    expect(streakQuery(7).queryKey).not.toEqual(streakQuery(8).queryKey);
  });
});

describe("queryFn 위임", () => {
  it("dailyStatsQuery는 statsApi.listStudySessionStats를 호출한다", async () => {
    await dailyStatsQuery(7, "2026-07-28").queryFn!({} as never);
    expect(listStudySessionStats).toHaveBeenCalledWith(7, "2026-07-28");
  });

  it("streakQuery는 statsApi.getStreak을 호출한다", async () => {
    await streakQuery(7).queryFn!({} as never);
    expect(getStreak).toHaveBeenCalledWith(7);
  });
});

describe("registeredUserIdQuery", () => {
  it("등록 성공 시 userId를 반환한다", async () => {
    mockedEnsure.mockResolvedValue(42);
    await expect(registeredUserIdQuery().queryFn!({} as never)).resolves.toBe(42);
  });

  it("등록 실패(null) 시 throw 한다 — 오류 UI·재시도 경로로 흐르게", async () => {
    mockedEnsure.mockResolvedValue(null);
    await expect(registeredUserIdQuery().queryFn!({} as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- statsQueries`
Expected: FAIL — `Cannot find module '../statsQueries'`

- [ ] **Step 3: 구현**

`apps/mobile/lib/statsQueries.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";

import { getStreak, listStudySessionStats } from "./statsApi";
import { ensureUserRegistered } from "./userApi";

/**
 * 서버 통계 queryOptions 모음 — queryKey·queryFn의 단일 정의처.
 * 세션 제출 성공 후에는 `statsKeys.all`로 일괄 invalidate 한다(BY-291).
 */
export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number) => ["stats", "streak", userId] as const,
};

export function dailyStatsQuery(userId: number, date: string) {
  return queryOptions({
    queryKey: statsKeys.daily(userId, date),
    queryFn: () => listStudySessionStats(userId, date),
  });
}

export function streakQuery(userId: number) {
  return queryOptions({
    queryKey: statsKeys.streak(userId),
    queryFn: () => getStreak(userId),
  });
}

/**
 * 익명 등록을 쿼리로 감싼다. `ensureUserRegistered`는 실패를 null로 삼키므로
 * 여기서 throw로 바꿔 react-query의 오류·재시도 경로에 태운다.
 * 성공한 userId는 세션 내내 불변이므로 staleTime을 무한으로 둔다.
 */
export function registeredUserIdQuery() {
  return queryOptions({
    queryKey: ["user", "registeredId"] as const,
    queryFn: async () => {
      const userId = await ensureUserRegistered();
      if (userId === null) {
        throw new Error("익명 유저 등록에 실패했습니다");
      }
      return userId;
    },
    staleTime: Infinity,
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- statsQueries`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/statsQueries.ts apps/mobile/lib/__tests__/statsQueries.test.ts
git commit -m "feat(home): 서버 통계 queryOptions 정의 추가 (BY-313)"
```

---

### Task 4: 화면 모델 매핑 (순수 함수)

**Files:**

- Create: `apps/mobile/lib/homeSummary.ts`
- Test: `apps/mobile/lib/__tests__/homeSummary.test.ts`

**Interfaces:**

- Consumes: `StudySessionListResponse` · `StudySessionStreakResponse` (`@focuson/types`)
- Produces:
  - `type HomeSummary = { focusSec: number; studySec: number; focusRate: number; streakDays: number; longestFocusSec: number }` — 기존 화면의 `HomeSummaryDraft`와 동일 형태(UI 무수정 교체)
  - `buildHomeSummary(stats: StudySessionListResponse, streak: StudySessionStreakResponse): HomeSummary`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/homeSummary.test.ts`:

```ts
import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

import { buildHomeSummary } from "../homeSummary";

const stats: StudySessionListResponse = {
  sessions: [],
  sessionCount: 2,
  totalStudySec: 5 * 3600,
  totalFocusSec: 3 * 3600,
  longestFocusSec: 52 * 60,
  focusRate: 71.3,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

const streak: StudySessionStreakResponse = { streak: 12, maxStreak: 20 };

describe("buildHomeSummary", () => {
  it("서버 응답을 화면 모델로 매핑한다 (집중률은 서버 값 그대로)", () => {
    expect(buildHomeSummary(stats, streak)).toEqual({
      focusSec: 3 * 3600,
      studySec: 5 * 3600,
      focusRate: 71.3,
      streakDays: 12,
      longestFocusSec: 52 * 60,
    });
  });

  it("기록 없는 날은 전부 0이다", () => {
    const empty: StudySessionListResponse = {
      ...stats,
      sessionCount: 0,
      totalStudySec: 0,
      totalFocusSec: 0,
      longestFocusSec: 0,
      focusRate: 0,
    };
    expect(buildHomeSummary(empty, { streak: 0, maxStreak: 0 })).toEqual({
      focusSec: 0,
      studySec: 0,
      focusRate: 0,
      streakDays: 0,
      longestFocusSec: 0,
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- homeSummary`
Expected: FAIL — `Cannot find module '../homeSummary'`

- [ ] **Step 3: 구현**

`apps/mobile/lib/homeSummary.ts`:

```ts
import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

/** S1 홈 통계 영역의 화면 모델. 집중률·스트릭은 서버 계산 값을 그대로 쓴다(로컬 보정 금지). */
export interface HomeSummary {
  focusSec: number;
  studySec: number;
  focusRate: number;
  streakDays: number;
  longestFocusSec: number;
}

export function buildHomeSummary(
  stats: StudySessionListResponse,
  streak: StudySessionStreakResponse,
): HomeSummary {
  return {
    focusSec: stats.totalFocusSec,
    studySec: stats.totalStudySec,
    focusRate: stats.focusRate,
    streakDays: streak.streak,
    longestFocusSec: stats.longestFocusSec,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- homeSummary`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/homeSummary.ts apps/mobile/lib/__tests__/homeSummary.test.ts
git commit -m "feat(home): 서버 통계 화면 모델 매핑 추가 (BY-313)"
```

---

### Task 5: useHomeSummary 조합 훅

**Files:**

- Create: `apps/mobile/components/home/useHomeSummary.ts`
- Test: `apps/mobile/components/home/__tests__/useHomeSummary.test.tsx`

**Interfaces:**

- Consumes: Task 2 `todayKstDateKey()` · Task 3 queryOptions 전부 · Task 4 `buildHomeSummary`/`HomeSummary`
- Produces:
  - `type HomeSummaryState = { status: "pending" } | { status: "error"; retry: () => void } | { status: "success"; summary: HomeSummary }`
  - `useHomeSummary(): HomeSummaryState` — 화면이 소비하는 유일한 인터페이스. 탭 포커스 시 stats 루트 키 invalidate.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/components/home/__tests__/useHomeSummary.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("expo-router", () => ({
  // 훅 단위 테스트에서는 내비게이션 컨텍스트가 없다 — 포커스 콜백은 no-op 처리.
  useFocusEffect: jest.fn(),
}));
jest.mock("../../../lib/statsApi", () => ({
  listStudySessionStats: jest.fn(),
  getStreak: jest.fn(),
}));
jest.mock("../../../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));

import { getStreak, listStudySessionStats } from "../../../lib/statsApi";
import { ensureUserRegistered } from "../../../lib/userApi";
import { useHomeSummary } from "../useHomeSummary";

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;
const mockedStreak = getStreak as jest.MockedFunction<typeof getStreak>;

const statsResponse = {
  sessions: [],
  sessionCount: 1,
  totalStudySec: 7200,
  totalFocusSec: 3600,
  longestFocusSec: 1800,
  focusRate: 50,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useHomeSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("userId 확보 → 통계·스트릭 조회 → success 상태로 화면 모델을 준다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9 });

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current).toEqual({
      status: "success",
      summary: {
        focusSec: 3600,
        studySec: 7200,
        focusRate: 50,
        streakDays: 3,
        longestFocusSec: 1800,
      },
    });
    // userId를 확보한 뒤에만 통계를 조회한다
    expect(mockedStats).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mockedStreak).toHaveBeenCalledWith(7);
  });

  it("익명 등록 실패 시 error 상태가 된다", async () => {
    mockedEnsure.mockResolvedValue(null);

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("통계 조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0 });

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));

    mockedStats.mockResolvedValue(statsResponse);
    if (result.current.status === "error") {
      result.current.retry();
    }
    await waitFor(() => expect(result.current.status).toBe("success"));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- useHomeSummary`
Expected: FAIL — `Cannot find module '../useHomeSummary'`

- [ ] **Step 3: 구현**

`apps/mobile/components/home/useHomeSummary.ts`:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { todayKstDateKey } from "../../lib/dateKst";
import { buildHomeSummary, type HomeSummary } from "../../lib/homeSummary";
import {
  dailyStatsQuery,
  registeredUserIdQuery,
  statsKeys,
  streakQuery,
} from "../../lib/statsQueries";

export type HomeSummaryState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; summary: HomeSummary };

/**
 * S1 홈 통계 조합 훅 — userId 확보(익명 등록) 후 오늘 통계·스트릭을 조회해 화면 모델로
 * 만든다. 화면은 이 훅의 상태만 알고 데이터 배선은 모른다. BY-316이 이 훅에 미전송
 * 로컬 세션 합산을 얹을 예정이다.
 */
export function useHomeSummary(): HomeSummaryState {
  const queryClient = useQueryClient();
  const user = useQuery(registeredUserIdQuery());
  const userId = user.data;
  const dateKey = todayKstDateKey();

  const stats = useQuery({ ...dailyStatsQuery(userId ?? 0, dateKey), enabled: userId != null });
  const streak = useQuery({ ...streakQuery(userId ?? 0), enabled: userId != null });

  // 탭 재진입 시 오늘 통계를 신선하게 유지한다. invalidate는 stale 표시 + 활성 쿼리 재조회.
  useFocusEffect(
    useCallback(() => {
      if (userId != null) {
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
      }
    }, [queryClient, userId]),
  );

  const retry = useCallback(() => {
    if (user.isError) {
      void user.refetch();
      return;
    }
    if (stats.isError) {
      void stats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  }, [user, stats, streak]);

  if (stats.data !== undefined && streak.data !== undefined) {
    return { status: "success", summary: buildHomeSummary(stats.data, streak.data) };
  }
  if (user.isError || stats.isError || streak.isError) {
    return { status: "error", retry };
  }
  return { status: "pending" };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- useHomeSummary`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/home/useHomeSummary.ts "apps/mobile/components/home/__tests__/useHomeSummary.test.tsx"
git commit -m "feat(home): 홈 통계 조합 훅 useHomeSummary 추가 (BY-313)"
```

---

### Task 6: components/ui — Skeleton · ErrorState 프리미티브

**Files:**

- Create: `apps/mobile/components/ui/Skeleton.tsx`
- Create: `apps/mobile/components/ui/ErrorState.tsx`
- Test: `apps/mobile/components/ui/__tests__/ErrorState.test.tsx`

**Interfaces:**

- Produces:
  - `Skeleton({ className }: { className?: string })` — 펄스(투명도 반복) 사각형. 크기·모서리는 호출부가 `className`으로 지정.
  - `ErrorState({ message, onRetry }: { message: string; onRetry: () => void })` — 메시지 + "다시 시도" 버튼.

- [ ] **Step 1: 실패하는 테스트 작성 (ErrorState — 동작이 있는 쪽만 테스트)**

`apps/mobile/components/ui/__tests__/ErrorState.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ErrorState } from "../ErrorState";

describe("ErrorState", () => {
  it("메시지와 다시 시도 버튼을 그리고, 버튼이 onRetry를 호출한다", () => {
    const onRetry = jest.fn();
    render(<ErrorState message="기록을 불러오지 못했어요" onRetry={onRetry} />);

    expect(screen.getByText("기록을 불러오지 못했어요")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- ErrorState`
Expected: FAIL — `Cannot find module '../ErrorState'`

- [ ] **Step 3: 구현**

`apps/mobile/components/ui/Skeleton.tsx`:

```tsx
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * 로딩 자리표시 사각형 — 투명도 펄스. Figma에 로딩 상태 정의가 없어 디자인 토큰
 * 배경색만 쓰는 최소 구현이다(BY-313). 크기·모서리는 호출부가 className으로 정한다.
 */
export function Skeleton({ className }: { className?: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.4, { duration: 700 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityLabel="불러오는 중"
      className={`bg-bg-layer2 dark:bg-bg-layer2-dark rounded-lg ${className ?? ""}`}
      style={style}
    />
  );
}
```

`apps/mobile/components/ui/ErrorState.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";

/**
 * 조회 실패 자리표시 — 메시지 + 다시 시도. Figma에 오류 상태 정의가 없어
 * 기존 카드 토큰만 쓰는 최소 구현이다(BY-313). 문구는 호출부가 정한다(voice-tone 준수).
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark items-center gap-3 rounded-[20px] border px-5 py-8">
      <Text className="text-text-secondary dark:text-text-secondary-dark text-sm">{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="다시 시도"
        className="bg-brand-subtle dark:bg-brand-subtle-dark min-h-11 justify-center rounded-full px-5"
      >
        <Text className="text-brand-primary dark:text-brand-primary-dark text-sm font-semibold">
          다시 시도
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- ErrorState`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/
git commit -m "feat(home): 로딩·오류 프리미티브(components/ui) 추가 (BY-313)"
```

---

### Task 7: 홈 화면 연결 — MOCK_SUMMARY 제거

**Files:**

- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Test: `apps/mobile/__tests__/home.test.tsx` (신규)

**Interfaces:**

- Consumes: Task 5 `useHomeSummary()` · Task 6 `Skeleton`/`ErrorState` · 기존 `homeFormat` 함수들
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/mobile/__tests__/home.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../components/home/useHomeSummary");
jest.mock("../lib/cameraPermissionGate", () => ({
  evaluateCameraPermissionGate: jest.fn().mockResolvedValue({ outcome: "granted" }),
}));

import HomeScreen from "../app/(tabs)/index";
import { useHomeSummary } from "../components/home/useHomeSummary";

const mockedUseHomeSummary = useHomeSummary as jest.MockedFunction<typeof useHomeSummary>;

describe("HomeScreen 통계 상태", () => {
  it("success — 서버 통계를 렌더한다", () => {
    mockedUseHomeSummary.mockReturnValue({
      status: "success",
      summary: {
        focusSec: 3 * 3600 + 42 * 60,
        studySec: 5 * 3600 + 12 * 60,
        focusRate: 71,
        streakDays: 12,
        longestFocusSec: 52 * 60,
      },
    });
    render(<HomeScreen />);

    expect(screen.getByText("71% 집중")).toBeTruthy();
    expect(screen.getByText("총 공부 5시간 12분")).toBeTruthy();
    expect(screen.getByText("12일째")).toBeTruthy();
    expect(screen.getByText("52분")).toBeTruthy();
  });

  it("pending — 스켈레톤을 렌더한다", () => {
    mockedUseHomeSummary.mockReturnValue({ status: "pending" });
    render(<HomeScreen />);

    expect(screen.getAllByLabelText("불러오는 중").length).toBeGreaterThan(0);
    expect(screen.queryByText("% 집중", { exact: false })).toBeNull();
  });

  it("error — 오류 문구와 다시 시도 버튼을 렌더한다", () => {
    const retry = jest.fn();
    mockedUseHomeSummary.mockReturnValue({ status: "error", retry });
    render(<HomeScreen />);

    expect(screen.getByText("기록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("streakDays 0이면 시작 유도 문구를 보여준다", () => {
    mockedUseHomeSummary.mockReturnValue({
      status: "success",
      summary: { focusSec: 0, studySec: 0, focusRate: 0, streakDays: 0, longestFocusSec: 0 },
    });
    render(<HomeScreen />);

    expect(screen.getByText("오늘 10분 집중하면 연속 공부가 시작돼요")).toBeTruthy();
  });
});
```

주의: 기존 `__tests__/` 폴더의 홈 관련 기존 테스트가 있으면(파일명 확인) `MOCK_SUMMARY` 의존 단언을 이 테스트로 대체·갱신한다. `jest.mock("../lib/cameraPermissionGate", ...)`가 기존 홈 테스트 패턴과 다르면 기존 패턴을 따른다 (`__tests__/onboarding-guide.test.tsx`·`focusStartFlow.test.ts` 참고).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- home.test`
Expected: FAIL (아직 화면이 mock을 렌더 — "71% 집중"은 우연히 통과할 수 있으나 pending/error 케이스는 반드시 실패)

- [ ] **Step 3: 화면 수정**

`app/(tabs)/index.tsx` 수정 내용:

1. `HomeSummaryDraft` 타입·`MOCK_SUMMARY` 상수·관련 주석 삭제. `import type { HomeSummary } from "../../lib/homeSummary";`로 대체.
2. `HeroTodayCard`는 `summary: HomeSummary` prop 그대로 (타입만 교체).
3. `StatCard`가 모듈 상수 `MOCK_SUMMARY`를 직접 읽던 것을 prop으로 교체:

```tsx
function StatCard({
  variant,
  summary,
  onPress,
}: {
  variant: "streak" | "longest";
  summary: HomeSummary;
  onPress?: () => void;
}) {
  const isStreak = variant === "streak";
  // ... 기존 JSX에서 MOCK_SUMMARY.streakDays → summary.streakDays,
  //     formatMinutes(MOCK_SUMMARY.longestFocusSec) → formatMinutes(summary.longestFocusSec)
}
```

4. `HomeScreen` 본문에서 훅 소비 + 3분기. 통계 영역(히어로 카드 + 스탯 카드 2개)만 분기하고 CTA·가이드 카드는 항상 렌더한다:

```tsx
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const summaryState = useHomeSummary();

  // ... ScrollView 내부, 헤더 아래:
  {summaryState.status === "pending" && (
    <>
      <Skeleton className="h-[180px] rounded-[20px]" />
      <View className="flex-row gap-3">
        <Skeleton className="h-[92px] flex-1 rounded-2xl" />
        <Skeleton className="h-[92px] flex-1 rounded-2xl" />
      </View>
    </>
  )}
  {summaryState.status === "error" && (
    <ErrorState message="기록을 불러오지 못했어요" onRetry={summaryState.retry} />
  )}
  {summaryState.status === "success" && (
    <>
      <HeroTodayCard summary={summaryState.summary} />
      {/* StartCtaCard·프라이버시 문구는 분기 밖(항상 렌더) — 기존 위치 유지 */}
      <View className="flex-row gap-3">
        <StatCard variant="streak" summary={summaryState.summary} onPress={...기존 그대로} />
        <StatCard variant="longest" summary={summaryState.summary} />
      </View>
    </>
  )}
}
```

배치 주의: 기존 화면 순서는 히어로 → CTA → 프라이버시 문구 → 스탯 카드 → 가이드 카드다. **CTA·프라이버시 문구·가이드 카드는 분기 밖에 두고**, 히어로 자리와 스탯 카드 자리 두 곳에만 상태별 대체물이 들어가게 구성한다 (pending이면 히어로 자리에 큰 스켈레톤·스탯 자리에 작은 스켈레톤 2개, error면 히어로 자리에 ErrorState 하나만 두고 스탯 자리는 생략).

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test`
Expected: PASS (기존 스위트 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx" apps/mobile/__tests__/home.test.tsx
git commit -m "feat(home): 홈 통계 영역 실데이터 연동 — MOCK_SUMMARY 제거 (BY-313)"
```

---

### Task 8: 전체 검증 + Expo Go 수동 확인

**Files:**

- 없음 (검증 전용)

- [ ] **Step 1: 모노레포 전체 검증**

Run: `pnpm turbo run lint typecheck test` (워크트리 루트에서)
Expected: 전 패키지 PASS

Run: `pnpm exec prettier --check .`
Expected: PASS (실패 시 `pnpm exec prettier --write` 후 별도 `style:` 커밋)

- [ ] **Step 2: Expo Go 수동 확인 (사용자와 함께)**

Run: `pnpm --filter mobile start`
확인 항목: ① 첫 진입 스켈레톤 → 실데이터 표시 ② 비행기 모드에서 첫 진입 시 오류+다시 시도 ③ 네트워크 복구 후 다시 시도로 데이터 표시 ④ 기록 없는 계정은 0 표시 ⑤ 탭 이동 후 복귀 시 갱신.

- [ ] **Step 3: 잔여 확인 사항 기록**

`formatMinutes`가 `Math.round`라 30초 이상이 올림된다("52분30초"→"53분"). 측정 대원칙("부풀리지 않는다")상 `Math.floor`가 맞을 수 있으나 표기 정책("1분 미만" 표기 미확정)과 얽혀 있어 이 티켓에서 바꾸지 않는다 — PR 본문에 질문으로 남긴다.

---

## Self-Review 결과

- 티켓 완료 조건 대조: TanStack Query 도입(T1) · MOCK_SUMMARY 제거+API 연동(T7) · 값 매핑(T4) · 포커스 재조회(T1 AppState + T5 useFocusEffect) · 스켈레톤(T6·T7) · 오류+재시도(T5·T6·T7) · userId 실패 처리(T3·T5) · 분 단위 점검(homeFormat 이미 분 단위 — T8 Step 3에 라운딩 이슈 기록) · 테스트·lint·typecheck(각 태스크 + T8). **date-fns는 이 티켓 사용처가 없어 BY-314로 이월** — 티켓 설명과 다른 점이므로 PR·티켓에 명시한다.
- 타입 일관성: `HomeSummary`(T4 정의)를 T5·T7이 동일 형태로 소비. `statsKeys.all`(T3)을 T5가 참조. `HomeSummaryState`(T5)를 T7이 분기.
