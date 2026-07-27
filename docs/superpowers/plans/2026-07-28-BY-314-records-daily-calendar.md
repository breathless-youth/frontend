# BY-314 기록(S5) 일별 기록·달력 연동 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록(S5) 화면의 달력 도트·선택일 학습 요약·공부 기록 리스트를 mock에서 실서버 데이터(`GET /api/stats`)로 교체한다.

**Architecture:** BY-313이 만든 react-query 기반(`lib/statsQueries.ts`의 `dailyStatsQuery`·`registeredUserIdQuery`, 앱 루트 `QueryClientProvider`) 위에 얹는다. 화면 상태는 `selectedKey`(선택일)·`month`(보이는 달) 둘뿐이고 서로 독립 — 달 이동은 선택일에 영향을 주지 않는다. 보이는 달에 선택일이 없으면 그 달 1일로 조회해 `studiedDatesInMonth`만 쓴다(Swagger 2026-07-28 확인: 기록 여부와 무관하게 항상 계산됨).

**Tech Stack:** Expo RN(expo-router) · @tanstack/react-query(313 도입, 새 의존성 없음) · jest + @testing-library/react-native

**설계 문서:** `docs/superpowers/specs/2026-07-28-BY-314-records-daily-calendar-design.md`

## Global Constraints

- pnpm 고정. **새 의존성 추가 금지** — react-query는 313에서 이미 도입됨.
- TypeScript strict. 타입 전용 import는 `import type`.
- 커밋 메시지: 기본 Conventional 타입만(`feat`/`fix`/`docs`/`test`/`refactor`…). **subject는 한글로 시작**(commitlint `subject-case`가 대문자 시작을 거부 — `BY-314`로 시작 금지), 티켓 키는 subject 끝에 `(BY-314)`.
- **커밋 단위는 의미 있는 작업 단위로 묶는다**(2026-07-28 사용자 피드백 — 313처럼 잘게 쪼개지 않기): 유틸+테스트 1커밋, 훅+테스트 1커밋, 화면 교체+테스트 1커밋.
- 서버 값을 그대로 신뢰한다 — `studiedDatesInMonth`·집계값 로컬 재판정/보정 금지.
- 연속 공부 배너·주간 체크 도트의 mock(`MOCK_STREAK_DAYS`·`mockWeekDoneDateKeys`)은 **삭제하지 않는다** — BY-315 몫.
- 모든 명령은 워크트리 루트(`worktrees/fe-by-314`)에서 실행.

---

### Task 1: BY-314 티켓 설명 완성 (Jira)

**Files:** 없음 (Jira만 수정)

**Interfaces:**

- Consumes: Swagger 확인 결과(2026-07-28) — `GET /api/stats`는 일 단위 조회이며 `studiedDatesInMonth`는 항상 계산·순공 1분 미만 세션 제외
- Produces: 완성된 BY-314 티켓 설명 (이후 작업의 단일원천)

- [ ] **Step 1: Jira `editJiraIssue`로 BY-314 description을 아래 내용으로 교체** (cloudId `5a4a3f92-f903-413f-ab27-3387d26d67a4`, contentFormat `markdown`)

```markdown
## 🎯 목표

기록(S5)의 달력 도트·선택일 학습 요약(2×2 타일)·공부 기록 리스트가 mock이 아닌 실제 서버 통계로 표시된다.

## ✅ 완료 조건

- `records.tsx`의 mock 블록 제거(`buildMockStats`·`MOCK_SESSION_TEMPLATES`·`mockCalendarRecordDateKeys`) — 연속 공부 배너·주간 체크 도트 mock은 BY-315 몫으로 유지
- `GET /api/stats?userId&date(선택일 KST)` 연동 — BY-313의 react-query 기반(`lib/statsQueries.ts`의 `dailyStatsQuery`·`registeredUserIdQuery`) 재사용
- 월 이동 정책(2026-07-28 확정): 달 이동은 선택일에 영향 없음 — 선택은 항상 유지("선택 없음" 상태 없음, 진입 시 오늘). 보이는 달에 선택일이 없으면 `date=그 달 1일`로 조회해 `studiedDatesInMonth`만 사용 — Swagger 확인(2026-07-28): `studiedDatesInMonth`는 해당 날짜의 기록 여부와 무관하게 항상 계산됨
- 달력 도트 기준(2026-07-28 확정): 스트릭과 동일한 "하루 순공 10분 이상". 서버 반영 전까지는 서버 값 그대로 신뢰 — 현 서버는 순공 1분 미만 세션만 제외(Swagger 명시), FE 로컬 재판정 금지
- 탭 재진입(포커스) 시 자동 재조회
- 첫 로딩 스켈레톤 · 조회 실패 시 캐시 유지(표시할 데이터가 없을 때만 오류 문구+재시도) · userId 미확보 시 동일 처리 — BY-313과 같은 방침, `components/ui`의 `Skeleton`/`ErrorState` 재사용
- 조회 날짜 유틸·조회 훅·화면 테스트 작성, `lint`/`typecheck`/`test` 통과

## 🚫 범위 밖

- 연속 공부 배너·주간 체크 도트 연동 → BY-315
- 미전송 로컬 세션 합산 → BY-316
- 달력 도트 10분 기준의 서버 반영 → BE (반영 전까지 서버 값이 기대와 다를 수 있으나 FE는 그대로 신뢰)

## 🔀 브랜치

`feature/BY-314-기록-일별-달력-연동` — `feature/BY-313-홈-실데이터-연동`에서 스택 분기. 313 dev 머지 후 dev로 리베이스 → dev PR, 제목 `[feat] BY-314 기록(S5) 일별 기록·달력 연동`

## 🔗 연관

- 선행: BY-313 홈 실데이터 연동(react-query 기반 도입) · BY-171/172(`lib/statsApi.ts`)
- 후속: BY-315 배너·주간 도트 연동 · BY-316 미전송 세션 합산
- 근거: fe `docs/superpowers/specs/2026-07-28-BY-314-records-daily-calendar-design.md` · fe `docs/screens/SCR-S5-records.md` · Swagger `GET /api/stats`(2026-07-28 확인)
```

- [ ] **Step 2: `getJiraIssue`로 반영 결과 확인** — description이 위 내용으로 바뀌었는지 확인

---

### Task 2: 달력 월 조회용 날짜 키 유틸

**Files:**

- Modify: `apps/mobile/lib/recordsFormat.ts` (파일 끝에 함수 추가)
- Test: `apps/mobile/lib/__tests__/recordsFormat.test.ts` (describe 추가)

**Interfaces:**

- Consumes: `CalendarMonth`·`monthOfDateKey`·`pad2` (recordsFormat.ts에 기존 존재)
- Produces: `statsQueryDateKey(selectedKey: string, month: CalendarMonth): string` — Task 3의 훅이 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `recordsFormat.test.ts`에 추가 (`statsQueryDateKey`를 import 목록에 추가)

```ts
describe("statsQueryDateKey", () => {
  it("선택일이 보이는 달에 있으면 선택일을 그대로 쓴다", () => {
    expect(statsQueryDateKey("2026-07-26", { year: 2026, month: 7 })).toBe("2026-07-26");
  });

  it("다른 달을 보는 중이면 그 달 1일을 쓴다", () => {
    expect(statsQueryDateKey("2026-07-26", { year: 2026, month: 8 })).toBe("2026-08-01");
    expect(statsQueryDateKey("2026-07-26", { year: 2025, month: 12 })).toBe("2025-12-01");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- recordsFormat`
Expected: FAIL — `statsQueryDateKey is not a function` 류

- [ ] **Step 3: 구현** — `recordsFormat.ts` 끝에 추가

```ts
/**
 * 보이는 달의 통계 조회용 날짜 키 — 선택일이 그 달에 있으면 선택일, 아니면 그 달 1일.
 * `GET /api/stats`는 일 단위 조회지만 `studiedDatesInMonth`(그 달의 공부일 목록)를 기록 여부와
 * 무관하게 항상 내려주므로(Swagger 2026-07-28 확인), 다른 달의 도트는 그 달 1일 조회로 얻는다.
 */
export function statsQueryDateKey(selectedKey: string, month: CalendarMonth): string {
  const selected = monthOfDateKey(selectedKey);
  if (selected.year === month.year && selected.month === month.month) {
    return selectedKey;
  }
  return `${month.year}-${pad2(month.month)}-01`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- recordsFormat`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/lib/recordsFormat.ts apps/mobile/lib/__tests__/recordsFormat.test.ts
git commit -m "feat(records): 달력 월 조회용 날짜 키 유틸 추가 (BY-314)"
```

---

### Task 3: 조회 훅 useRecordsData

**Files:**

- Create: `apps/mobile/components/records/useRecordsData.ts`
- Test: `apps/mobile/components/records/__tests__/useRecordsData.test.tsx`

**Interfaces:**

- Consumes: `statsQueryDateKey` (Task 2) · `dailyStatsQuery(userId: number, date: string)`·`registeredUserIdQuery()`·`statsKeys.all` (`lib/statsQueries.ts`, 313 기존) · `StudySessionListResponse` (`@focuson/types`)
- Produces: Task 4가 사용하는 훅 —

```ts
export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

export function useRecordsData(
  selectedKey: string,
  month: CalendarMonth,
): { day: RecordsDayState; studiedDates: readonly string[] };
```

- [ ] **Step 1: 실패하는 테스트 작성** — `__tests__/useRecordsData.test.tsx` (홈의 `useHomeSummary.test.tsx` 패턴을 그대로 따른다)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { listStudySessionStats } from "../../../lib/statsApi";
import { ensureUserRegistered } from "../../../lib/userApi";
import { useRecordsData } from "../useRecordsData";

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

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;

function statsResponse(studiedDatesInMonth: string[]) {
  return {
    sessions: [],
    sessionCount: 0,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    studiedDatesInMonth,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRecordsData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("선택일이 보이는 달에 있으면 선택일 조회 하나로 세션·도트를 모두 채운다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse(["2026-07-24", "2026-07-26"]));

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.day.status).toBe("pending");
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    expect(result.current.studiedDates).toEqual(["2026-07-24", "2026-07-26"]);
    // userId 확보 후 선택일로 딱 한 번 조회한다
    expect(mockedStats).toHaveBeenCalledTimes(1);
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-07-26");
  });

  it("다른 달을 보는 중이면 그 달 1일을 추가 조회해 도트만 쓴다 — 선택일 데이터는 유지", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockImplementation(async (_userId, date) =>
      date === "2026-08-01"
        ? statsResponse(["2026-08-02", "2026-08-03"])
        : statsResponse(["2026-07-26"]),
    );

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 8 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("success"));
    await waitFor(() => expect(result.current.studiedDates).toEqual(["2026-08-02", "2026-08-03"]));
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-07-26");
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01");
    // 선택일(7/26) 요약은 8월을 보는 동안에도 success로 유지된다
    if (result.current.day.status === "success") {
      expect(result.current.day.stats.studiedDatesInMonth).toEqual(["2026-07-26"]);
    }
  });

  it("익명 등록 실패 시 error 상태가 된다", async () => {
    mockedEnsure.mockResolvedValue(null);

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("error"));
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("error"));

    mockedStats.mockResolvedValue(statsResponse([]));
    if (result.current.day.status === "error") {
      result.current.day.retry();
    }
    await waitFor(() => expect(result.current.day.status).toBe("success"));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- useRecordsData`
Expected: FAIL — `Cannot find module '../useRecordsData'`

- [ ] **Step 3: 구현** — `components/records/useRecordsData.ts` 생성

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import type { StudySessionListResponse } from "@focuson/types";

import { type CalendarMonth, statsQueryDateKey } from "../../lib/recordsFormat";
import { dailyStatsQuery, registeredUserIdQuery, statsKeys } from "../../lib/statsQueries";

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

/**
 * S5 기록 조회 훅 — userId 확보(익명 등록) 후 선택일 통계와 보이는 달의 달력 도트를 조회한다.
 * 화면은 이 훅의 상태만 알고 데이터 배선은 모른다(홈 useHomeSummary와 같은 방침).
 *
 * 달 이동은 선택일에 영향을 주지 않는다(2026-07-28 확정 — "선택 없음" 상태는 없다). 보이는 달에
 * 선택일이 없으면 그 달 1일로 추가 조회해 `studiedDatesInMonth`만 쓴다 — 선택일 요약·리스트는
 * react-query 캐시로 계속 표시된다. 조회 실패 시에도 캐시가 있으면 success를 유지한다
 * (`day.data` 우선 분기가 그 역할이다).
 */
export function useRecordsData(
  selectedKey: string,
  month: CalendarMonth,
): { day: RecordsDayState; studiedDates: readonly string[] } {
  const queryClient = useQueryClient();
  const user = useQuery(registeredUserIdQuery());
  const userId = user.data;

  const monthDateKey = statsQueryDateKey(selectedKey, month);
  const selectedInMonth = monthDateKey === selectedKey;

  const day = useQuery({ ...dailyStatsQuery(userId ?? 0, selectedKey), enabled: userId != null });
  const monthStats = useQuery({
    ...dailyStatsQuery(userId ?? 0, monthDateKey),
    enabled: userId != null && !selectedInMonth,
  });

  // 탭 재진입 시 통계를 신선하게 유지한다. invalidate는 stale 표시 + 활성 쿼리 재조회.
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
    if (day.isError) {
      void day.refetch();
    }
    if (monthStats.isError) {
      void monthStats.refetch();
    }
  }, [user, day, monthStats]);

  // 도트 조회 실패는 화면을 막지 않는다 — 빈 배열로 두면 도트만 안 찍힌다(포커스 재조회로 복구).
  const studiedDates =
    (selectedInMonth ? day.data?.studiedDatesInMonth : monthStats.data?.studiedDatesInMonth) ?? [];

  if (day.data !== undefined) {
    return { day: { status: "success", stats: day.data }, studiedDates };
  }
  if (user.isError || day.isError) {
    return { day: { status: "error", retry }, studiedDates };
  }
  return { day: { status: "pending" }, studiedDates };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- useRecordsData`
Expected: PASS (4개)

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/components/records/useRecordsData.ts apps/mobile/components/records/__tests__/useRecordsData.test.tsx
git commit -m "feat(records): 선택일 통계·달력 도트 조회 훅 useRecordsData 추가 (BY-314)"
```

---

### Task 4: records.tsx mock 교체 + 화면 테스트 갱신

**Files:**

- Modify: `apps/mobile/app/(tabs)/records.tsx` (mock 블록 제거, 훅 배선, 로딩/오류 상태)
- Modify: `apps/mobile/__tests__/records.test.tsx` (서버 mock 기반으로 재작성)

**Interfaces:**

- Consumes: `useRecordsData`·`RecordsDayState` (Task 3) · `Skeleton`·`ErrorState` (`components/ui`, 313 기존)
- Produces: 실데이터로 동작하는 S5 화면 (후속 BY-315가 이 화면의 배너 부분만 이어받음)

- [ ] **Step 1: 화면 테스트를 서버 mock 기반으로 갱신** — `__tests__/records.test.tsx`에서:

기존 파일 상단의 `jest.mock`/fake timers 설정은 유지하고, 아래를 추가·변경한다.

**(a) 모듈 mock 추가** (safe-area mock 아래):

```tsx
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock("../lib/statsApi", () => ({
  listStudySessionStats: jest.fn(),
  getStreak: jest.fn(),
}));
jest.mock("../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));
```

**(b) 서버 응답 빌더** — 삭제되는 `buildMockStats`를 서버 관점으로 테스트에 이식한다. 값(세션 3건·12일 연속)은 기존 mock과 동일해서 아래 기존 단언들이 그대로 유효하다:

```tsx
import type { StudySessionListResponse, StudySessionSummary } from "@focuson/types";

import { listStudySessionStats } from "../lib/statsApi";
import { ensureUserRegistered } from "../lib/userApi";

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;

/** 고정 오늘(KST 2026-07-26)부터 12일 연속 기록 — 기존 화면 mock과 동일한 시나리오. */
const STUDIED_DATES = [
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
];

const SESSION_TEMPLATES = [
  {
    startsAt: "08:55",
    endsAt: "11:02",
    studySec: 2 * 3600 + 7 * 60,
    focusSec: 3600 + 38 * 60,
    eventCounts: { AWAY: 2, PHONE: 1, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "13:10",
    endsAt: "14:40",
    studySec: 3600 + 30 * 60,
    focusSec: 3600 + 12 * 60,
    eventCounts: { AWAY: 1, PHONE: 0, DEVICE: 0, PAUSE: 0 },
  },
  {
    startsAt: "16:20",
    endsAt: "17:30",
    studySec: 3600 + 10 * 60,
    focusSec: 48 * 60,
    eventCounts: { AWAY: 0, PHONE: 2, DEVICE: 0, PAUSE: 0 },
  },
];

function toUtcIso(dateKey: string, kstClock: string): string {
  return new Date(`${dateKey}T${kstClock}:00+09:00`).toISOString();
}

/** 서버 계약대로: 요청 날짜의 세션 + 그 달의 공부일 목록. 세션은 시작 시각 내림차순. */
function serverStatsResponse(dateKey: string): StudySessionListResponse {
  const hasRecord = STUDIED_DATES.includes(dateKey);
  const sessions: StudySessionSummary[] = hasRecord
    ? SESSION_TEMPLATES.map((t, index) => ({
        id: index + 1,
        statDate: dateKey,
        startedAt: toUtcIso(dateKey, t.startsAt),
        endedAt: toUtcIso(dateKey, t.endsAt),
        studySec: t.studySec,
        focusSec: t.focusSec,
        focusRate: Math.round((t.focusSec / t.studySec) * 1000) / 10,
        eventCounts: t.eventCounts,
      })).reverse()
    : [];
  const totalStudySec = sessions.reduce((sum, s) => sum + s.studySec, 0);
  const totalFocusSec = sessions.reduce((sum, s) => sum + s.focusSec, 0);
  const monthPrefix = dateKey.slice(0, 7);
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec,
    totalFocusSec,
    longestFocusSec: sessions.reduce((max, s) => Math.max(max, s.focusSec), 0),
    focusRate: totalStudySec === 0 ? 0 : Math.round((totalFocusSec / totalStudySec) * 1000) / 10,
    totalEventCounts: sessions.reduce(
      (acc, s) => ({
        AWAY: acc.AWAY + s.eventCounts.AWAY,
        PHONE: acc.PHONE + s.eventCounts.PHONE,
        DEVICE: acc.DEVICE + s.eventCounts.DEVICE,
        PAUSE: acc.PAUSE + s.eventCounts.PAUSE,
      }),
      { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
    ),
    studiedDatesInMonth: STUDIED_DATES.filter((d) => d.startsWith(monthPrefix)),
  };
}
```

**(c) 렌더 헬퍼** — 각 테스트의 `render(<RecordsScreen />)`를 `await renderRecords()`로 바꾼다 (`it`은 `async`로):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

async function renderRecords() {
  mockedEnsure.mockResolvedValue(7);
  mockedStats.mockImplementation(async (_userId, date) => serverStatsResponse(date));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecordsScreen />
    </QueryClientProvider>,
  );
  await screen.findByText("7월 26일 학습 요약");
}
```

**(d) 기존 단언은 전부 유지**하고, 새 동작 테스트 3개를 추가한다:

```tsx
it("다음 달로 넘기면 그 달 1일로 도트를 조회한다 — 선택일 요약은 유지", async () => {
  await renderRecords();

  fireEvent.press(screen.getByRole("button", { name: "다음 달" }));

  expect(screen.getByText("2026년 8월")).toBeTruthy();
  expect(screen.getByText("7월 26일 학습 요약")).toBeTruthy();
  await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01"));
});

it("첫 로딩 동안 스켈레톤을 보여준다", async () => {
  mockedEnsure.mockResolvedValue(7);
  mockedStats.mockImplementation(() => new Promise(() => undefined)); // 영원히 pending
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecordsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findAllByLabelText("불러오는 중")).not.toHaveLength(0);
  expect(screen.queryByText("7월 26일 학습 요약")).toBeNull();
});

it("조회 실패 시 오류 문구와 다시 시도를 보여준다", async () => {
  mockedEnsure.mockResolvedValue(7);
  mockedStats.mockRejectedValue(new Error("network"));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RecordsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("기록을 불러오지 못했어요")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});
```

(`waitFor`를 `@testing-library/react-native` import에 추가)

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter mobile test -- records.test`
Expected: FAIL — 화면이 아직 mock 데이터라 provider 없이도 그려지거나, 새 테스트(8월 1일 조회·스켈레톤·오류)가 실패

- [ ] **Step 3: 화면 구현** — `app/(tabs)/records.tsx` 수정:

**(a) 삭제**: `MOCK_SESSION_TEMPLATES`·`MockSessionTemplate`·`toUtcIso`·`roundToTenth`·`MOCK_CALENDAR_RECORD_DAY_COUNT`·`mockCalendarRecordDateKeys`·`emptyEventCounts`·`buildMockStats`와 그 관련 주석 블록, `StudySessionEventCounts`·`StudySessionListResponse`·`StudySessionSummary` import(더 이상 화면에서 직접 안 씀). **유지**: `MOCK_STREAK_DAYS`·`mockWeekDoneDateKeys`(BY-315 몫 — 계약 미확인 ①②는 그대로 남긴다는 주석도 유지).

**(b) 배선**: 파일 상단 mock 블록 주석을 "달력 도트·선택일 요약·리스트는 실서버(`useRecordsData`), 배너·주간 도트는 BY-315까지 mock" 취지로 축약하고, 컴포넌트 본문을:

```tsx
import { Fragment, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconChevronDown } from "../../components/icons";
import { MonthCalendar } from "../../components/records/MonthCalendar";
import { SessionListItem } from "../../components/records/SessionListItem";
import { StreakBanner, type StreakWeekDay } from "../../components/records/StreakBanner";
import { SummaryTiles } from "../../components/records/SummaryTiles";
import { useRecordsData } from "../../components/records/useRecordsData";
import { ErrorState } from "../../components/ui/ErrorState";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  addDaysToDateKey,
  type CalendarMonth,
  dayOfDateKey,
  kstDateKey,
  monthOfDateKey,
  shiftMonth,
  summaryTitle,
  WEEKDAY_LABELS,
  weekdayIndexOfDateKey,
  weekDateKeys,
} from "../../lib/recordsFormat";
```

```tsx
export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  const todayKey = useMemo(() => kstDateKey(), []);
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(todayKey));

  const { day, studiedDates } = useRecordsData(selectedKey, month);

  // 주간 체크 도트는 BY-315까지 mock 유지 (계약 미확인 ①② — SCR-S5-records.md).
  const weekDoneDates = useMemo(() => mockWeekDoneDateKeys(todayKey), [todayKey]);
  const weekDays = useMemo<StreakWeekDay[]>(() => {
    const done = new Set(weekDoneDates);
    return weekDateKeys(todayKey).map((dateKey) => ({
      dateKey,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
      dayOfMonth: dayOfDateKey(dateKey),
      state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
    }));
  }, [todayKey, weekDoneDates]);

  // 서버가 시작 시각 내림차순으로 내려주지만(Swagger), 화면 약속(최신순 고정)은 여기서도 보장한다.
  const sessions = useMemo(
    () =>
      day.status === "success"
        ? [...day.stats.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        : [],
    [day],
  );

  return (
    <ScrollView
      className="bg-bg-base dark:bg-bg-base-dark flex-1"
      contentContainerStyle={{ paddingTop: insets.top + 17, paddingBottom: 24 }}
    >
      <View className="px-5">
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-2xl font-bold leading-[29px]"
        >
          기록
        </Text>

        <View className="mt-[13px]">
          <StreakBanner streakDays={MOCK_STREAK_DAYS} days={weekDays} />

          <View className="mt-6">
            <MonthCalendar
              month={month}
              todayKey={todayKey}
              selectedKey={selectedKey}
              studiedDates={studiedDates}
              onSelectDate={setSelectedKey}
              // 달 이동은 선택일을 건드리지 않는다(2026-07-28 확정 — 선택은 항상 유지).
              onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
              onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
            />
          </View>

          {day.status === "pending" && (
            <View className="mt-6 gap-2.5">
              <Skeleton className="h-[21px] w-40 rounded-md" />
              <View className="flex-row gap-2.5">
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
              </View>
              <View className="flex-row gap-2.5">
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
                <Skeleton className="h-[92px] flex-1 rounded-2xl" />
              </View>
            </View>
          )}

          {day.status === "error" && (
            <View className="mt-6">
              <ErrorState message="기록을 불러오지 못했어요" onRetry={day.retry} />
            </View>
          )}

          {day.status === "success" && (
            <>
              <View className="mt-6 gap-2.5">
                <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
                  {summaryTitle(selectedKey)}
                </Text>
                <SummaryTiles stats={day.stats} />
              </View>

              <View className="mt-2">
                <View className="flex-row items-end justify-between">
                  <Text className="text-text-primary dark:text-text-primary-dark text-[17px] font-bold leading-[21px]">
                    공부 기록
                  </Text>
                  <View className="flex-row items-center gap-1 pb-[2px]">
                    <Text className="text-text-secondary dark:text-text-secondary-dark text-[13px] leading-4">
                      최신순
                    </Text>
                    <IconChevronDown size={9} />
                  </View>
                </View>

                {sessions.length === 0 ? (
                  <EmptyDayNotice />
                ) : (
                  sessions.map((session, index) => (
                    <Fragment key={session.id}>
                      {index > 0 && (
                        <View className="bg-border-default dark:bg-border-default-dark h-px" />
                      )}
                      <SessionListItem session={session} />
                    </Fragment>
                  ))
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
```

(`EmptyDayNotice`·정렬 컨트롤 주석·헤어라인 주석 등 기존 요소는 그대로 유지 — 위 코드에서 생략된 주석은 삭제하지 말 것)

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter mobile test -- records.test useRecordsData recordsFormat`
Expected: PASS 전부 (기존 단언 + 신규 3개)

- [ ] **Step 5: 커밋**

```bash
git add "apps/mobile/app/(tabs)/records.tsx" apps/mobile/__tests__/records.test.tsx
git commit -m "feat(records): 기록 화면 실데이터 연동 — 달력·요약·리스트 mock 교체 (BY-314)"
```

---

### Task 5: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 루트에서 전체 검사**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 전부 PASS. 실패 시 원인 수정 후 해당 Task의 커밋에 이어 `fix`/`style` 커밋.

- [ ] **Step 2: (선택) Expo Go 실동작 확인**

Run: `pnpm --filter mobile start` — 기록 탭에서 실서버 데이터·월 이동·오류 상태 확인. 실기기 확인이 어려우면 건너뛰고 PR 체크리스트에 표기.

---

### Task 6: PR 생성·머지 대기·완료 처리

**Files:** 없음 (git/GitHub/Jira만)

- [ ] **Step 1: 푸시 및 PR 생성**

```bash
git push -u origin "feature/BY-314-기록-일별-달력-연동"
gh pr create --base dev \
  --title "[feat] BY-314 기록(S5) 일별 기록·달력 연동" \
  --body "$(cat .github/pull_request_template.md 체크리스트 채워서 작성 — 본문에 'BY-313 머지 후 리베이스 예정(스택 PR)' 명시)"
```

PR 본문 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)` 추가.

- [ ] **Step 2: BY-313 머지 확인 후 리베이스**

313의 dev 머지 전에는 이 PR의 diff에 313 커밋이 섞여 보인다 — 머지되면:

```bash
git fetch origin dev
git rebase origin/dev
git push --force-with-lease
```

- [ ] **Step 3: 머지 후 Jira 완료 전환** — `getTransitionsForJiraIssue`로 BY-314의 "완료" 전환 id 확인 → `transitionJiraIssue` 실행. 티켓에 PR 링크 코멘트 추가(`addCommentToJiraIssue`).

---

## Self-Review 결과 (작성 시 수행)

- 스펙 커버리지: 설계 문서의 상태 모델(Task 4 배선)·조회 설계(Task 2·3)·도트 기준(Task 1 티켓 명시)·오류/로딩(Task 3·4)·테스트(각 Task)·작업 흐름(Task 1·6) 모두 대응 확인.
- 계약 확인 항목(세션 없는 날짜 조회 시 `studiedDatesInMonth`)은 Swagger로 이미 해소(2026-07-28) — Task 1 티켓 설명에 근거로 반영.
- 타입 일관성: `RecordsDayState`·`useRecordsData` 시그니처가 Task 3 정의와 Task 4 사용처에서 동일함을 확인.
