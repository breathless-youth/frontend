# SCRUM-171 일일 공부 세션 통계 조회 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 앱에서 Swagger `GET /api/stats`의 일일 세션 통계를 조회하는 타입 안전 API 클라이언트를 제공한다.

**Architecture:** 서버 계약은 `@focuson/types`에 집중하고, Expo 설정의 API base URL을 사용하는 네트워크 호출은 `apps/mobile/lib/statsApi.ts`에 둔다. 화면·그래프·streak는 이 작업에 포함하지 않으며 호출자는 원본 응답을 그대로 받는다.

**Tech Stack:** TypeScript strict, Expo Constants, React Native `fetch`, Jest, pnpm workspace

## Global Constraints

- 실제 백엔드 Swagger 계약만 사용한다.
- 요청은 `GET /api/stats?userId=<number>&date=<YYYY-MM-DD>`이며 두 쿼리 파라미터는 필수다.
- 상태 키는 `PHONE`, `DEVICE`, `AWAY`, `PAUSE`만 허용한다.
- API 오류는 JSON `message`를 우선 사용하고 없으면 `통계 조회 실패 (HTTP <status>)`로 처리한다.
- UI, 그래프(SCRUM-174), streak API는 변경하지 않는다.
- 임시 응답 `console.log`는 실제 반환값 확인 직후 제거하고 최종 커밋에는 남기지 않는다.

---

## File Structure

- Modify: `packages/types/src/index.ts` — Swagger 통계 응답 타입을 공개한다.
- Create: `apps/mobile/lib/statsApi.ts` — API base URL 획득, GET 호출, 오류 변환을 담당한다.
- Create: `apps/mobile/lib/__tests__/statsApi.test.ts` — URL·성공·빈 목록·HTTP 오류·네트워크 오류를 검증한다.

### Task 1: Swagger 응답 계약 타입 추가

**Files:**

- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Produces: `StudyStatus`, `StudySessionEventCounts`, `StudySessionSummary`, `StudySessionListResponse`

- [ ] **Step 1: Swagger 스키마 필드를 계약 타입으로 선언한다**

```ts
export type StudyStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE";
export type StudySessionEventCounts = Record<StudyStatus, number>;

export interface StudySessionSummary {
  id: number;
  statDate: string;
  startedAt: string;
  endedAt: string;
  studySec: number;
  focusSec: number;
  focusRate: number;
  eventCounts: StudySessionEventCounts;
}

export interface StudySessionListResponse {
  sessions: StudySessionSummary[];
  sessionCount: number;
  totalStudySec: number;
  totalFocusSec: number;
  longestFocusSec: number;
  focusRate: number;
  totalEventCounts: StudySessionEventCounts;
  studiedDatesInMonth: string[];
}
```

- [ ] **Step 2: 타입 검사를 실행한다**

Run: `pnpm --filter @focuson/types typecheck`

Expected: exit code 0.

- [ ] **Step 3: 계약 타입을 커밋한다**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add study session stats contracts"
```

### Task 2: 조회 클라이언트의 테스트 우선 구현

**Files:**

- Create: `apps/mobile/lib/__tests__/statsApi.test.ts`
- Create: `apps/mobile/lib/statsApi.ts`

**Interfaces:**

- Consumes: `StudySessionListResponse` from `@focuson/types`
- Produces: `listStudySessionStats(userId: number, date: string): Promise<StudySessionListResponse>`

- [ ] **Step 1: 실패하는 API 클라이언트 테스트를 작성한다**

```ts
import { listStudySessionStats } from "../statsApi";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));

const mockedFetch = jest.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

const response = {
  sessions: [],
  sessionCount: 0,
  totalStudySec: 0,
  totalFocusSec: 0,
  longestFocusSec: 0,
  focusRate: 0,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: ["2026-07-25"],
};

it("userId와 date로 일일 통계를 조회한다", async () => {
  mockedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => response });
  await expect(listStudySessionStats(7, "2026-07-25")).resolves.toEqual(response);
  expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/stats?userId=7&date=2026-07-25", {
    method: "GET",
  });
});
```

같은 파일에 빈 목록 반환, JSON `message`가 있는 400 응답, JSON 파싱 불가 500 응답, `TypeError("Network request failed")`를 각각 검증하는 테스트를 추가한다.

- [ ] **Step 2: 새 테스트가 기능 부재로 실패하는지 확인한다**

Run: `pnpm --filter mobile test -- statsApi.test.ts`

Expected: FAIL with module-not-found for `../statsApi`.

- [ ] **Step 3: 최소 구현을 작성한다**

```ts
import Constants from "expo-constants";
import type { StudySessionListResponse } from "@focuson/types";

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) throw new Error("app.json extra.apiBaseUrl이 설정되지 않았습니다");
  return url;
}

export async function listStudySessionStats(
  userId: number,
  date: string,
): Promise<StudySessionListResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/stats?userId=${userId}&date=${date}`, {
    method: "GET",
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `통계 조회 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionListResponse;
}
```

- [ ] **Step 4: 새 테스트가 통과하는지 확인한다**

Run: `pnpm --filter mobile test -- statsApi.test.ts`

Expected: PASS for exact URL, empty result, JSON error, fallback error, and network error.

- [ ] **Step 5: 클라이언트와 테스트를 커밋한다**

```bash
git add apps/mobile/lib/statsApi.ts apps/mobile/lib/__tests__/statsApi.test.ts
git commit -m "feat(mobile): add daily study session stats API"
```

### Task 3: 임시 응답 로그 확인 및 최종 검증

**Files:**

- Modify then restore: `apps/mobile/lib/statsApi.ts`

**Interfaces:**

- Consumes: `listStudySessionStats(userId, date)`
- Produces: 로그 없이 `StudySessionListResponse`를 반환하는 최종 클라이언트

- [ ] **Step 1: 반환 직전에 임시 로그를 추가한다**

```ts
const body = (await res.json()) as StudySessionListResponse;
console.log("[stats] 일일 세션 통계 응답", body);
return body;
```

- [ ] **Step 2: 성공 테스트를 실행해 임시 로그의 반환값을 확인한다**

Run: `pnpm --filter mobile test -- statsApi.test.ts`

Expected: PASS and the mocked Swagger-shaped response appears in Jest console output.

- [ ] **Step 3: 임시 로그를 제거하고 원본 반환으로 복원한다**

```ts
return (await res.json()) as StudySessionListResponse;
```

- [ ] **Step 4: 최종 검증을 실행한다**

Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm test`

Expected: all commands exit 0; `rg -n "\[stats\] 일일 세션 통계 응답" apps/mobile` returns no matches.

- [ ] **Step 5: 로그 제거 상태를 포함해 최종 변경을 커밋한다**

```bash
git add apps/mobile/lib/statsApi.ts apps/mobile/lib/__tests__/statsApi.test.ts packages/types/src/index.ts
git commit -m "test(mobile): cover daily study session stats API"
```
