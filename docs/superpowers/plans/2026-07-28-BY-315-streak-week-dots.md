# BY-315 기록(S5) 스트릭 배너·주간 도트 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기록(S5)의 연속 공부 배너 숫자(`MOCK_STREAK_DAYS`)와 주간 체크 도트(mock)를 실서버 스트릭 데이터(`GET /api/stats/streak` + 신규 `from`/`to`·`studiedDatesInRange`)로 교체한다.

**Architecture:** 기존 레이어를 그대로 확장한다 — `packages/types` 계약 추가 → `lib/statsApi.getStreak` range 파라미터 → `lib/statsQueries.streakQuery(userId, range?)`(키에 range 포함, 홈의 range 없는 호출과 캐시 분리) → `components/records/useRecordsData`에 스트릭 쿼리 통합(`streakBanner` 상태 반환) → `records.tsx`는 상태만 렌더. 새 파일·새 의존성 없음.

**Tech Stack:** 기존 그대로 (TanStack Query · NativeWind · jest-expo). date-fns 설치 금지(도입 결정 종결).

## Global Constraints

- 작업 위치: `c:\Users\wonza\Desktop\Wonil\projects\focuson\worktrees\fe-by-315` — 이 워크트리 밖 파일 수정 금지
- TypeScript strict, `any` 금지, 타입 전용 import는 `import type`
- 새 의존성 0. 서버 계약 타입은 스웨거에 실재하는 것만(`studiedDatesInRange`는 2026-07-28 스웨거 확인됨)
- 배너 숫자·도트는 서버 값 그대로 (로컬 보정·재계산 금지)
- `from`/`to`는 항상 함께 전달 (서버: 하나만 주면 400)
- 배너 상태 표시(2026-07-28 확정): 로딩=`Skeleton`, 실패(캐시 없음)=배너 숨김(오류·재시도는 일별 기록 영역 ErrorState가 대표, 그 retry에 스트릭 재조회 포함), 캐시 있으면 캐시 유지
- 주 정의는 기존 `weekDateKeys`(일~토) 그대로 — `from`=주 일요일, `to`=오늘(KST)
- 홈(`useHomeSummary`)의 `streakQuery(userId)` 호출은 **수정하지 않는다** — range 파라미터는 optional로 하위호환
- 커밋: `feat(records): 제목 (BY-315)` 형식(소문자 시작), push·merge 금지
- 각 태스크 종료 시 관련 테스트 + `pnpm --filter mobile typecheck` 통과 후 커밋

---

### Task 1: 계약 타입 확장 — studiedDatesInRange

**Files:**

- Modify: `packages/types/src/index.ts`
- Modify: 이 타입을 fixture로 쓰는 기존 테스트 전부 (typecheck가 알려줌 — 최소 `apps/mobile/lib/__tests__/statsApi.test.ts`, `apps/mobile/components/home/__tests__/useHomeSummary.test.tsx`; `components/records/__tests__/` 아래도 확인)

**Interfaces:**

- Produces: `StudySessionStreakResponse`에 `studiedDatesInRange: string[]` 필드 (필수 — 서버는 from/to 생략 시 빈 배열을 항상 내려줌, 스웨거 2026-07-28)

- [ ] **Step 1: 타입 수정**

`packages/types/src/index.ts`의 `StudySessionStreakResponse`를 다음으로 교체:

```ts
export interface StudySessionStreakResponse {
  /** 현재 연속 공부일 — 오늘 기록이 없어도 어제까지 이어졌으면 유지 중으로 본다 */
  streak: number;
  /** 역대 최장 연속 공부일 */
  maxStreak: number;
  /**
   * from~to 기간 중 스트릭 인정 기준(세션 하나의 순공시간 10분 이상)을 만족한 날짜 목록
   * (YYYY-MM-DD). from/to를 생략하면 빈 배열. (Swagger 2026-07-28 추가)
   */
  studiedDatesInRange: string[];
}
```

- [ ] **Step 2: typecheck로 깨진 fixture 찾기**

Run: `pnpm --filter mobile typecheck`
Expected: FAIL — streak fixture들에 `studiedDatesInRange` 누락 오류

- [ ] **Step 3: 모든 fixture에 `studiedDatesInRange: []` 추가 후 통과 확인**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile test && pnpm --filter web typecheck`
Expected: PASS (web도 이 타입을 참조할 수 있으므로 typecheck 확인)

- [ ] **Step 4: Commit**

```bash
git add packages/types apps/mobile
git commit -m "feat(records): 스트릭 응답에 studiedDatesInRange 계약 추가 (BY-315)"
```

---

### Task 2: statsApi.getStreak — range 파라미터

**Files:**

- Modify: `apps/mobile/lib/statsApi.ts`
- Test: `apps/mobile/lib/__tests__/statsApi.test.ts` (기존 describe에 케이스 추가)

**Interfaces:**

- Produces: `export type StreakRange = { from: string; to: string }` · `getStreak(userId: number, range?: StreakRange)` — range 있으면 `&from=...&to=...` 쿼리 추가. 기존 1-인자 호출 하위호환.

- [ ] **Step 1: 실패하는 테스트 추가** (`getStreak` describe 안에)

```ts
it("from/to 범위를 주면 쿼리 파라미터로 함께 보낸다", async () => {
  mockedFetch.mockResolvedValue(
    jsonResponse(200, { streak: 5, maxStreak: 12, studiedDatesInRange: ["2026-07-27"] }),
  );

  await expect(getStreak(7, { from: "2026-07-26", to: "2026-07-28" })).resolves.toEqual({
    streak: 5,
    maxStreak: 12,
    studiedDatesInRange: ["2026-07-27"],
  });
  expect(mockedFetch).toHaveBeenCalledWith(
    "http://api.test/api/stats/streak?userId=7&from=2026-07-26&to=2026-07-28",
    { method: "GET" },
  );
});

it("range가 없으면 기존과 같은 URL로 조회한다", async () => {
  mockedFetch.mockResolvedValue(
    jsonResponse(200, { streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
  );

  await getStreak(7);
  expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/stats/streak?userId=7", {
    method: "GET",
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- statsApi` / Expected: FAIL (from/to 미전송)

- [ ] **Step 3: 구현**

`getStreak`을 다음으로 교체 (파일 상단에 타입 export 추가):

```ts
/** 스트릭 기간 조회 범위 — 서버 규칙상 from/to는 항상 함께 보내야 한다(하나만 주면 400). */
export type StreakRange = { from: string; to: string };

export async function getStreak(
  userId: number,
  range?: StreakRange,
): Promise<StudySessionStreakResponse> {
  const rangeParams = range ? `&from=${range.from}&to=${range.to}` : "";
  const res = await fetch(`${apiBaseUrl()}/api/stats/streak?userId=${userId}${rangeParams}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "스트릭 조회 실패");
  }
  return (await res.json()) as StudySessionStreakResponse;
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile test -- statsApi` / Expected: PASS
- [ ] **Step 5: Commit** — `git add apps/mobile/lib/statsApi.ts apps/mobile/lib/__tests__/statsApi.test.ts && git commit -m "feat(records): getStreak from/to 범위 파라미터 지원 (BY-315)"`

---

### Task 3: streakQuery — range 포함 queryKey

**Files:**

- Modify: `apps/mobile/lib/statsQueries.ts`
- Test: `apps/mobile/lib/__tests__/statsQueries.test.ts` (케이스 추가)

**Interfaces:**

- Consumes: Task 2의 `StreakRange`
- Produces: `statsKeys.streak(userId, range?)` — range 있으면 `["stats","streak",userId,from,to]`, 없으면 기존 `["stats","streak",userId]` · `streakQuery(userId, range?)` — 홈(무인자 range)과 기록(주간 range)의 캐시가 자연 분리. 두 키 모두 `"stats"` 루트 공유(포커스·제출 후 일괄 invalidate 대상 유지).

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
it("range가 있으면 키가 달라지고 stats 루트는 공유한다", () => {
  const range = { from: "2026-07-26", to: "2026-07-28" };
  expect(streakQuery(7, range).queryKey).not.toEqual(streakQuery(7).queryKey);
  expect(streakQuery(7, range).queryKey[0]).toBe(statsKeys.all[0]);
});

it("streakQuery는 range를 statsApi.getStreak에 그대로 전달한다", async () => {
  const range = { from: "2026-07-26", to: "2026-07-28" };
  await streakQuery(7, range).queryFn!({} as never);
  expect(getStreak).toHaveBeenCalledWith(7, range);
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- statsQueries` / Expected: FAIL
- [ ] **Step 3: 구현**

```ts
import type { StreakRange } from "./statsApi";

export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number, range?: StreakRange) =>
    range
      ? (["stats", "streak", userId, range.from, range.to] as const)
      : (["stats", "streak", userId] as const),
};

export function streakQuery(userId: number, range?: StreakRange) {
  return queryOptions({
    queryKey: statsKeys.streak(userId, range),
    queryFn: () => getStreak(userId, range),
  });
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile test -- statsQueries && pnpm --filter mobile test -- useHomeSummary` (홈 하위호환 확인) / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(records): streakQuery 범위 파라미터·캐시 키 확장 (BY-315)"`

---

### Task 4: useRecordsData — 스트릭 쿼리 통합

**Files:**

- Modify: `apps/mobile/components/records/useRecordsData.ts`
- Test: `apps/mobile/components/records/__tests__/` 아래 기존 useRecordsData 테스트 확장 (파일명은 디렉터리 확인 — 없으면 `useRecordsData.test.tsx` 신규)

**Interfaces:**

- Consumes: Task 3 `streakQuery` · 기존 `weekDateKeys`(recordsFormat)
- Produces: 시그니처 변경 `useRecordsData(selectedKey, month, todayKey: string)` → 반환에 `streakBanner: StreakBannerState` 추가.

```ts
export type StreakBannerState =
  | { status: "pending" }
  | { status: "hidden" }
  | { status: "success"; streakDays: number; doneDates: readonly string[] };
```

- [ ] **Step 1: 실패하는 테스트 작성** — 기존 테스트 파일의 mock 패턴(statsApi·userApi·expo-router mock, QueryClientProvider wrapper)을 그대로 따라 3케이스:
  1. 성공: `getStreak`이 `{streak: 3, maxStreak: 9, studiedDatesInRange: ["2026-07-27"]}` 반환 → `streakBanner`가 `{status:"success", streakDays:3, doneDates:["2026-07-27"]}` · `getStreak`이 `(userId, {from: 주 일요일, to: todayKey})`로 호출됐는지 단언
  2. 실패(캐시 없음): `getStreak` reject → `streakBanner.status === "hidden"` (day 영역은 정상이어야 함 — 스트릭 실패가 일별 기록을 막지 않는다)
  3. retry: day·streak 모두 실패 후 retry() 호출 → 둘 다 refetch

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- useRecordsData` / Expected: FAIL
- [ ] **Step 3: 구현** — 훅에 추가:

```ts
const weekStart = weekDateKeys(todayKey)[0];
const streak = useQuery({
  ...streakQuery(userId ?? 0, { from: weekStart, to: todayKey }),
  enabled: userId != null,
});
```

retry에 `if (streak.isError) { void streak.refetch(); }` 추가. 반환 직전:

```ts
// 배너 상태(2026-07-28 확정): 캐시 있으면 success 유지, 실패(캐시 없음)면 숨김 —
// 틀린 "0일째"를 보여주지 않는다. 오류 안내·재시도는 일별 기록 영역 ErrorState가 대표한다.
const streakBanner: StreakBannerState =
  streak.data !== undefined
    ? {
        status: "success",
        streakDays: streak.data.streak,
        doneDates: streak.data.studiedDatesInRange,
      }
    : user.isError || streak.isError
      ? { status: "hidden" }
      : { status: "pending" };
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile test -- useRecordsData` (신규 3케이스 + 기존 전부) / Expected: PASS. `records.tsx`가 아직 옛 시그니처라 typecheck는 Task 5에서 함께 통과시킨다 — 이 태스크에서는 test만 확인.
- [ ] **Step 5: Commit** — `git commit -m "feat(records): useRecordsData에 주간 스트릭 조회 통합 (BY-315)"`

---

### Task 5: records.tsx — mock 제거·배너 연결

**Files:**

- Modify: `apps/mobile/app/(tabs)/records.tsx`
- Test: `apps/mobile/__tests__/records.test.tsx` (기존 스위트 갱신)

**Interfaces:**

- Consumes: Task 4 `streakBanner` · 기존 `Skeleton`(components/ui) · 기존 `StreakBanner`

- [ ] **Step 1: 실패하는 테스트 갱신** — `records.test.tsx`의 기존 mock 방식 확인 후(useRecordsData를 mock하고 있으면 그 mock에 `streakBanner` 추가, statsApi를 mock하고 있으면 응답 fixture 추가) 다음을 단언:
  - success: 배너에 `${streak}일째` 텍스트 · `studiedDatesInRange` 날짜의 도트가 done(접근성 라벨 "공부함")
  - pending: 배너 자리 스켈레톤(라벨 "불러오는 중") 존재, `일째` 텍스트 부재
  - hidden: 배너·스켈레톤 모두 부재, 달력 등 나머지는 렌더
  - `MOCK_STREAK_DAYS` 참조가 남아 있지 않음(컴파일로 보장)

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- records.test` / Expected: FAIL
- [ ] **Step 3: 화면 수정**
  1. mock 블록(`MOCK_STREAK_DAYS`·`mockWeekDoneDateKeys`와 "mock 데이터 안내" 주석, 관련 TODO) 삭제
  2. `const { day, studiedDates, streakBanner } = useRecordsData(selectedKey, month, todayKey);`
  3. `weekDays` useMemo를 `streakBanner` 기반으로 교체 (success가 아니면 빈 배열):

```tsx
const weekDays = useMemo<StreakWeekDay[]>(() => {
  if (streakBanner.status !== "success") {
    return [];
  }
  const done = new Set(streakBanner.doneDates);
  return weekDateKeys(todayKey).map((dateKey) => ({
    dateKey,
    weekdayLabel: WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)],
    dayOfMonth: dayOfDateKey(dateKey),
    state: dateKey === todayKey ? "today" : done.has(dateKey) ? "done" : "none",
  }));
}, [streakBanner, todayKey]);
```

4. 배너 렌더 교체 (`<View className="mt-[13px]">` 안):

```tsx
{
  streakBanner.status === "pending" && <Skeleton className="h-[92px] rounded-2xl" />;
}
{
  streakBanner.status === "success" && (
    <StreakBanner streakDays={streakBanner.streakDays} days={weekDays} />
  );
}
{
  /* hidden이면 아무것도 그리지 않는다 — 오류·재시도는 아래 일별 기록 ErrorState가 대표(2026-07-28 확정) */
}
```

주의: hidden일 때 `mt-6`으로 달력 위 여백이 어긋나지 않는지 확인 — 배너가 없으면 달력의 `mt-6` 래퍼가 첫 요소가 되므로 그대로 둔다(추가 조정 불필요하면 손대지 않는다).

- [ ] **Step 4: 전체 확인** — Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test` / Expected: 전부 PASS
- [ ] **Step 5: Commit** — `git add apps/mobile && git commit -m "feat(records): 스트릭 배너·주간 도트 실데이터 연동 (BY-315)"`

---

### Task 6: 전체 검증

- [ ] Run: `pnpm turbo run lint typecheck test` — 15개 태스크 전부 PASS
- [ ] Run: 브랜치 변경 파일만 `pnpm exec prettier --check` — PASS (레포 전체 199파일 실패는 기존 문제, 무시)
- [ ] Expo Go 수동 확인 항목 기록(사용자와): 배너 스켈레톤→실데이터, 주간 도트가 `studiedDatesInRange`와 일치, 오프라인 첫 진입 시 배너 숨김+일별 오류 재시도로 복구, 홈 스트릭 카드 회귀 없음

## Self-Review 결과

- 티켓 완료 조건 대조: 타입(T1) · getStreak range(T2) · streakQuery 캐시 분리(T3) · mock 제거·배너 연결(T4·T5) · 도트 매핑 규칙(T5의 weekDays — today 우선 유지) · 로딩/실패 표시(확정안 A — T4 상태·T5 렌더) · 테스트(각 태스크) · date-fns 미설치(전 태스크) 전부 커버.
- 타입 일관성: `StreakRange`(T2)를 T3·T4가 소비, `StreakBannerState`(T4)를 T5가 분기, `studiedDatesInRange`(T1)를 T2 fixture·T4 매핑이 사용.
- 홈 회귀 방어: T3 Step 4에서 useHomeSummary 테스트 실행.
