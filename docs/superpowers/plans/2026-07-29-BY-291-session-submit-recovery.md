# BY-291 세션 제출·복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 기록이 앱 크래시·오프라인에도 유실되지 않고 서버에 제출된다 — `@focuson/study-core` 최소 신설(타입·타이머 산출·소급 마감·페이로드) + 네이티브 저장(체크포인트 원자적 쓰기·세션당 큐 파일)·제출·재전송·복구.

**Architecture:** 순수 계산은 `packages/study-core`(vitest, RN/DOM 의존 0), 부수효과는 `apps/mobile/lib`(jest). expo-file-system 접근은 로직 없는 얇은 어댑터(`SessionFileStore`) 하나에 격리하고, 스토어·큐·동기화 로직은 인메모리 fake로 전부 테스트한다. WebView 브리지 실연결·사용자 알림·웹 로직 이관은 범위 밖(2026-07-29 확정 — 티켓 참조).

**Tech Stack:** 순수 TS + vitest(study-core, design-tokens 패턴) · expo-file-system ~19(설치 완료, 커밋 대기) · jest-expo(mobile)

## Global Constraints

- 작업 위치: `c:\Users\wonza\Desktop\Wonil\projects\focuson\worktrees\fe-by-291` — 밖 수정 금지. PR #13과 파일 겹침 금지(`packages/types/src/bridge.ts` 건드리지 않음 — dev에 아직 없음)
- TypeScript strict, `any` 금지, `import type`. study-core는 RN·DOM·TF·WebRTC import 금지
- 서버 계약 타입은 `@focuson/types` 기존 것만 사용(`StudySessionCreateRequest`·`StatusEventPayload`·`StudyEventStatus`·`StudySessionResponse`)
- 소급 마감 대원칙: **종료 시각에 현재 시각(Date.now)을 쓰지 않는다** — 크래시=lastAliveAtMs, 일시정지 초과=진입+N분. N분 기본 20분 설정 상수(`PAUSE_AUTO_END_MS`), 하드코딩 금지
- 큐 처리 규칙: 성공 응답 시에만 제거 · HTTP 400(4xx)=제거+warn 로그 · 네트워크/5xx=유지 · 사용자 오류 노출 없음
- 저장: documentDirectory 하위 `focuson/` · 체크포인트=단일 파일 임시쓰기→rename · 큐=`focuson/pending/{sessionId}.json`
- 커밋: `feat(session): 제목 (BY-291)` 계열(소문자 시작, commitlint 기본 타입). push는 전체 완료 후 한 번(PR까지 승인됨)
- 각 태스크 종료 시 해당 패키지 lint·typecheck·test 통과 후 커밋

---

### Task 1: study-core 스캐폴드 + 도메인 타입

**Files:**

- Create: `packages/study-core/package.json` · `tsconfig.json` · `eslint.config.mjs` (design-tokens 패턴 복사)
- Create: `packages/study-core/src/checkpoint.ts` · `src/index.ts`
- Test: `packages/study-core/src/__tests__/checkpoint.test.ts`

**Interfaces:**

- Produces: `DetectorKind`·`SessionPhase`·`ClosedInterval`·`SessionCheckpoint` 타입, `representativeStatus(reasons: DetectorKind[]): StudyEventStatus`

- [ ] **Step 1: 스캐폴드** — `packages/design-tokens`의 `package.json`(이름만 `@focuson/study-core`, dependencies에 `"@focuson/types": "workspace:*"` 추가)·`tsconfig.json`·`eslint.config.mjs`를 복사해 생성. `pnpm install`로 워크스페이스 링크.

- [ ] **Step 2: 실패하는 테스트** — `src/__tests__/checkpoint.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { representativeStatus } from "../checkpoint";

describe("representativeStatus", () => {
  it("자리 이탈이 섞이면 무조건 AWAY다 (away > device > phone)", () => {
    expect(representativeStatus(["phone", "away"])).toBe("AWAY");
    expect(representativeStatus(["away", "device", "phone"])).toBe("AWAY");
  });

  it("자리 이탈이 없으면 기기 조작이 휴대폰보다 우선한다", () => {
    expect(representativeStatus(["phone", "device"])).toBe("DEVICE");
    expect(representativeStatus(["phone"])).toBe("PHONE");
  });

  it("빈 배열은 방어적으로 AWAY다 (측정 불가=자리 이탈과 동일 취급 원칙)", () => {
    expect(representativeStatus([])).toBe("AWAY");
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm --filter @focuson/study-core test` / Expected: FAIL

- [ ] **Step 4: 구현** — `src/checkpoint.ts`:

```ts
import type { StudyEventStatus } from "@focuson/types";

/**
 * 공부 세션 도메인 타입 — fe 스펙 2·6절(2026-07-26 확정) 그대로.
 * 이 패키지는 순수 TS다: RN·DOM·카메라·네트워크를 모른다.
 */

/** 나열 순서 = 동시 감지 시 대표를 고르는 우선순위 (스펙 4절). */
export const DETECTOR_PRIORITY = ["away", "device", "phone"] as const;

export type DetectorKind = (typeof DETECTOR_PRIORITY)[number];

export type SessionPhase =
  | { kind: "focus" }
  | { kind: "distracted"; reasons: DetectorKind[] }
  | { kind: "paused"; cause: "manual" | "background" };

/** 이미 닫힌 비공부 구간 — 대표 status가 확정된 상태로 담긴다(스펙 6절). */
export interface ClosedInterval {
  status: StudyEventStatus;
  startedAtMs: number;
  endedAtMs: number;
}

export interface SessionCheckpoint {
  schemaVersion: 1;
  /** 로컬 큐 식별자 — 서버 중복 방지는 (userId, startedAt) 복합키가 담당(스펙 11절). */
  sessionId: string;
  startedAtMs: number;
  /** 마지막으로 웹이 살아 있었음이 확인된 시각. */
  lastAliveAtMs: number;
  phase: SessionPhase;
  phaseStartedAtMs: number;
  closedIntervals: ClosedInterval[];
}

const DETECTOR_TO_STATUS: Record<DetectorKind, StudyEventStatus> = {
  away: "AWAY",
  device: "DEVICE",
  phone: "PHONE",
};

/** 열린 비집중 구간을 닫을 때의 대표 status. 빈 배열은 방어적으로 AWAY(측정 불가=자리 이탈 취급). */
export function representativeStatus(reasons: DetectorKind[]): StudyEventStatus {
  const top = DETECTOR_PRIORITY.find((kind) => reasons.includes(kind));
  return top ? DETECTOR_TO_STATUS[top] : "AWAY";
}
```

`src/index.ts`: `export * from "./checkpoint";`

- [ ] **Step 5: 통과 확인 + lint·typecheck** — Run: `pnpm --filter @focuson/study-core lint && pnpm --filter @focuson/study-core typecheck && pnpm --filter @focuson/study-core test` / Expected: PASS
- [ ] **Step 6: Commit** — `git add packages/study-core pnpm-lock.yaml && git commit -m "feat(session): study-core 패키지 신설 — 세션 도메인 타입 (BY-291)"`

---

### Task 2: closeout — 타이머 산출 + 소급 마감 3갈래

**Files:**

- Create: `packages/study-core/src/closeout.ts`
- Test: `packages/study-core/src/__tests__/closeout.test.ts`
- Modify: `packages/study-core/src/index.ts` (re-export 추가)

**Interfaces:**

- Consumes: Task 1 타입 전부
- Produces:
  - `PAUSE_AUTO_END_MS = 20 * 60 * 1000` (설정 상수 — 위키 확정 기본 20분, M1 튜닝 대상)
  - `computeTotals(startedAtMs, endedAtMs, intervals): { studySec: number; focusSec: number }` — 스펙 5절 산출식
  - `closeOutCheckpoint(checkpoint, nowMs, options?: { pauseAutoEndMs?: number }): CloseoutResult`
  - `type CloseoutResult = { kind: "finalized"; endedAtMs: number; intervals: ClosedInterval[] } | { kind: "restore" }`

- [ ] **Step 1: 실패하는 테스트** — `src/__tests__/closeout.test.ts` (아래 시나리오 전부):

```ts
import { describe, expect, it } from "vitest";

import type { ClosedInterval, SessionCheckpoint } from "../checkpoint";
import { closeOutCheckpoint, computeTotals, PAUSE_AUTO_END_MS } from "../closeout";

const T0 = Date.UTC(2026, 6, 29, 0, 0, 0); // 세션 시작 기준점

function checkpoint(overrides: Partial<SessionCheckpoint>): SessionCheckpoint {
  return {
    schemaVersion: 1,
    sessionId: "sess-1",
    startedAtMs: T0,
    lastAliveAtMs: T0 + 60 * 60_000,
    phase: { kind: "focus" },
    phaseStartedAtMs: T0,
    closedIntervals: [],
    ...overrides,
  };
}

describe("computeTotals (스펙 5절)", () => {
  it("구간에서 파생한다: studySec=span−pause, focusSec=거기서 비집중 추가 차감", () => {
    const intervals: ClosedInterval[] = [
      { status: "PAUSE", startedAtMs: T0 + 10 * 60_000, endedAtMs: T0 + 20 * 60_000 },
      { status: "AWAY", startedAtMs: T0 + 30 * 60_000, endedAtMs: T0 + 35 * 60_000 },
    ];
    expect(computeTotals(T0, T0 + 60 * 60_000, intervals)).toEqual({
      studySec: 50 * 60,
      focusSec: 45 * 60,
    });
  });

  it("무작위 구간 조합에서도 서버 검증 부등식 0 ≤ focusSec ≤ studySec을 만족한다", () => {
    // 겹치지 않는 무작위 구간을 순차 생성하는 결정적 의사난수 성질 검사(시드 고정 LCG)
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 50; run += 1) {
      const spanMs = Math.floor(rand() * 3 * 60 * 60_000) + 60_000;
      const intervals: ClosedInterval[] = [];
      let cursor = T0;
      while (cursor < T0 + spanMs - 1000 && rand() > 0.3) {
        const start = cursor + Math.floor(rand() * 5 * 60_000);
        const end = Math.min(start + Math.floor(rand() * 10 * 60_000) + 1000, T0 + spanMs);
        if (end <= start) break;
        intervals.push({
          status: rand() > 0.5 ? "PAUSE" : rand() > 0.5 ? "AWAY" : "PHONE",
          startedAtMs: start,
          endedAtMs: end,
        });
        cursor = end;
      }
      const { studySec, focusSec } = computeTotals(T0, T0 + spanMs, intervals);
      expect(focusSec).toBeGreaterThanOrEqual(0);
      expect(studySec).toBeGreaterThanOrEqual(focusSec);
      expect(studySec).toBeLessThanOrEqual(Math.floor(spanMs / 1000));
    }
  });
});

describe("closeOutCheckpoint (스펙 6절 — 3갈래)", () => {
  const NOW = T0 + 24 * 60 * 60_000; // 복구 판정 시각(다음 날) — 종료 시각으로 쓰이면 안 된다

  it("크래시(focus): lastAliveAtMs로 마감하고 현재 시각을 쓰지 않는다", () => {
    const result = closeOutCheckpoint(checkpoint({}), NOW);
    expect(result).toEqual({ kind: "finalized", endedAtMs: T0 + 60 * 60_000, intervals: [] });
  });

  it("크래시(distracted): 열린 구간을 대표 우선순위로 닫아 포함한다", () => {
    const cp = checkpoint({
      phase: { kind: "distracted", reasons: ["phone", "away"] },
      phaseStartedAtMs: T0 + 50 * 60_000,
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.intervals).toEqual([
        { status: "AWAY", startedAtMs: T0 + 50 * 60_000, endedAtMs: T0 + 60 * 60_000 },
      ]);
    }
  });

  it("paused N분 미경과: 복원 대상이다 (마감하지 않는다)", () => {
    const cp = checkpoint({
      phase: { kind: "paused", cause: "background" },
      phaseStartedAtMs: T0 + 40 * 60_000,
    });
    expect(closeOutCheckpoint(cp, T0 + 40 * 60_000 + PAUSE_AUTO_END_MS - 1)).toEqual({
      kind: "restore",
    });
  });

  it("paused N분 경과: 진입시각+N분으로 마감하고 PAUSE 구간을 포함한다", () => {
    const pausedAt = T0 + 40 * 60_000;
    const cp = checkpoint({
      phase: { kind: "paused", cause: "manual" },
      phaseStartedAtMs: pausedAt,
      lastAliveAtMs: pausedAt,
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result).toEqual({
      kind: "finalized",
      endedAtMs: pausedAt + PAUSE_AUTO_END_MS,
      intervals: [
        { status: "PAUSE", startedAtMs: pausedAt, endedAtMs: pausedAt + PAUSE_AUTO_END_MS },
      ],
    });
  });

  it("pauseAutoEndMs 옵션으로 대기 시간을 바꿀 수 있다 (설정 상수 — M1 튜닝)", () => {
    const pausedAt = T0 + 40 * 60_000;
    const cp = checkpoint({
      phase: { kind: "paused", cause: "manual" },
      phaseStartedAtMs: pausedAt,
    });
    const result = closeOutCheckpoint(cp, NOW, { pauseAutoEndMs: 5 * 60_000 });
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.endedAtMs).toBe(pausedAt + 5 * 60_000);
    }
  });

  it("0ms 열린 구간(전이 직후 크래시)은 이벤트로 만들지 않는다", () => {
    const cp = checkpoint({
      phase: { kind: "distracted", reasons: ["phone"] },
      phaseStartedAtMs: T0 + 60 * 60_000, // lastAliveAtMs와 동일
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.intervals).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @focuson/study-core test` / Expected: FAIL
- [ ] **Step 3: 구현** — `src/closeout.ts`:

```ts
import type { ClosedInterval, SessionCheckpoint } from "./checkpoint";
import { representativeStatus } from "./checkpoint";

/** 일시정지 자동 종료 대기 시간 — 위키 확정 기본 20분, M1 테스트에서 튜닝(하드코딩 금지 원칙). */
export const PAUSE_AUTO_END_MS = 20 * 60 * 1000;

export interface SessionTotals {
  studySec: number;
  focusSec: number;
}

/**
 * 타이머를 별도로 굴리지 않고 구간에서 파생한다(스펙 5절) — 이 구조가 서버 검증 부등식
 * 0 ≤ focusSec ≤ studySec ≤ span−pause를 계산상 자동으로 만족시킨다.
 */
export function computeTotals(
  startedAtMs: number,
  endedAtMs: number,
  intervals: ClosedInterval[],
): SessionTotals {
  const spanMs = Math.max(0, endedAtMs - startedAtMs);
  let pausedMs = 0;
  let distractedMs = 0;
  for (const interval of intervals) {
    const len = Math.max(0, interval.endedAtMs - interval.startedAtMs);
    if (interval.status === "PAUSE") {
      pausedMs += len;
    } else {
      distractedMs += len;
    }
  }
  const studySec = Math.max(0, Math.floor((spanMs - pausedMs) / 1000));
  const focusSec = Math.max(0, Math.floor((spanMs - pausedMs - distractedMs) / 1000));
  return { studySec, focusSec: Math.min(focusSec, studySec) };
}

export type CloseoutResult =
  { kind: "finalized"; endedAtMs: number; intervals: ClosedInterval[] } | { kind: "restore" };

/**
 * 미마감 체크포인트의 소급 마감(스펙 6절). 대원칙: 종료 시각은 측정이 끊긴 시각이며
 * 절대 nowMs(다시 연 시각)를 쓰지 않는다 — nowMs는 paused 경과 판정에만 쓴다.
 */
export function closeOutCheckpoint(
  checkpoint: SessionCheckpoint,
  nowMs: number,
  options?: { pauseAutoEndMs?: number },
): CloseoutResult {
  const pauseAutoEndMs = options?.pauseAutoEndMs ?? PAUSE_AUTO_END_MS;
  const { phase } = checkpoint;

  if (phase.kind === "paused") {
    if (nowMs - checkpoint.phaseStartedAtMs < pauseAutoEndMs) {
      return { kind: "restore" };
    }
    const endedAtMs = checkpoint.phaseStartedAtMs + pauseAutoEndMs;
    return {
      kind: "finalized",
      endedAtMs,
      intervals: appendOpenInterval(checkpoint, "PAUSE", endedAtMs),
    };
  }

  const endedAtMs = checkpoint.lastAliveAtMs;
  if (phase.kind === "distracted") {
    return {
      kind: "finalized",
      endedAtMs,
      intervals: appendOpenInterval(checkpoint, representativeStatus(phase.reasons), endedAtMs),
    };
  }
  return { kind: "finalized", endedAtMs, intervals: [...checkpoint.closedIntervals] };
}

function appendOpenInterval(
  checkpoint: SessionCheckpoint,
  status: ClosedInterval["status"],
  endedAtMs: number,
): ClosedInterval[] {
  const intervals = [...checkpoint.closedIntervals];
  if (endedAtMs > checkpoint.phaseStartedAtMs) {
    intervals.push({ status, startedAtMs: checkpoint.phaseStartedAtMs, endedAtMs });
  }
  return intervals;
}
```

`src/index.ts`에 `export * from "./closeout";` 추가.

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter @focuson/study-core lint && pnpm --filter @focuson/study-core typecheck && pnpm --filter @focuson/study-core test` / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(session): 타이머 산출·소급 마감 3갈래 구현 (BY-291)"`

---

### Task 3: payload — 제출 페이로드 생성

**Files:**

- Create: `packages/study-core/src/payload.ts`
- Test: `packages/study-core/src/__tests__/payload.test.ts`
- Modify: `src/index.ts` (re-export)

**Interfaces:**

- Consumes: Task 1·2 전부, `@focuson/types`의 `StudySessionCreateRequest`
- Produces: `type SubmitPayload = Omit<StudySessionCreateRequest, "userId">` · `buildSubmitPayload(checkpoint, finalized: { endedAtMs, intervals }): SubmitPayload`

- [ ] **Step 1: 실패하는 테스트** — 케이스: ① 정상 매핑(UTC ISO-8601 밀리초 포함, 이벤트 시각 정렬, totals 일치) ② 0ms 구간 제외 ③ 이벤트 없으면 빈 배열 + focusRate 100% 상황(studySec===focusSec). 코드:

```ts
import { describe, expect, it } from "vitest";

import { buildSubmitPayload } from "../payload";

const T0 = Date.UTC(2026, 6, 29, 1, 0, 0);

it("체크포인트+마감 결과를 서버 계약 페이로드로 만든다", () => {
  const payload = buildSubmitPayload(
    {
      schemaVersion: 1,
      sessionId: "s",
      startedAtMs: T0,
      lastAliveAtMs: T0,
      phase: { kind: "focus" },
      phaseStartedAtMs: T0,
      closedIntervals: [],
    },
    {
      endedAtMs: T0 + 90 * 60_000,
      intervals: [
        { status: "PAUSE", startedAtMs: T0 + 30 * 60_000, endedAtMs: T0 + 40 * 60_000 },
        { status: "PHONE", startedAtMs: T0 + 10 * 60_000, endedAtMs: T0 + 15 * 60_000 },
        { status: "AWAY", startedAtMs: T0 + 50 * 60_000, endedAtMs: T0 + 50 * 60_000 }, // 0ms — 제외
      ],
    },
  );

  expect(payload).toEqual({
    startedAt: "2026-07-29T01:00:00.000Z",
    endedAt: "2026-07-29T02:30:00.000Z",
    studySec: 80 * 60,
    focusSec: 75 * 60,
    events: [
      {
        status: "PHONE",
        startedAt: "2026-07-29T01:10:00.000Z",
        endedAt: "2026-07-29T01:15:00.000Z",
      },
      {
        status: "PAUSE",
        startedAt: "2026-07-29T01:30:00.000Z",
        endedAt: "2026-07-29T01:40:00.000Z",
      },
    ],
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter @focuson/study-core test` / Expected: FAIL
- [ ] **Step 3: 구현** — `src/payload.ts`:

```ts
import type { StudySessionCreateRequest } from "@focuson/types";

import type { ClosedInterval, SessionCheckpoint } from "./checkpoint";
import { computeTotals } from "./closeout";

/** userId는 네이티브(또는 브라우저 단독 모드의 웹)가 붙인다 — 스펙 7절. */
export type SubmitPayload = Omit<StudySessionCreateRequest, "userId">;

export function buildSubmitPayload(
  checkpoint: SessionCheckpoint,
  finalized: { endedAtMs: number; intervals: ClosedInterval[] },
): SubmitPayload {
  // 서버는 겹침·0초 이벤트를 거부한다(계약) — 0ms는 여기서 거르고, 정렬은 가독·결정성용.
  const events = finalized.intervals
    .filter((interval) => interval.endedAtMs > interval.startedAtMs)
    .sort((a, b) => a.startedAtMs - b.startedAtMs)
    .map((interval) => ({
      status: interval.status,
      startedAt: new Date(interval.startedAtMs).toISOString(),
      endedAt: new Date(interval.endedAtMs).toISOString(),
    }));
  const totals = computeTotals(checkpoint.startedAtMs, finalized.endedAtMs, finalized.intervals);
  return {
    startedAt: new Date(checkpoint.startedAtMs).toISOString(),
    endedAt: new Date(finalized.endedAtMs).toISOString(),
    studySec: totals.studySec,
    focusSec: totals.focusSec,
    events,
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: 패키지 lint·typecheck·test / Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(session): 제출 페이로드 생성 추가 (BY-291)"`

---

### Task 4: 네이티브 저장 — 파일 어댑터·체크포인트 스토어·미제출 큐

**Files:**

- Create: `apps/mobile/lib/sessionFileStore.ts` (어댑터 — expo-file-system 격리)
- Create: `apps/mobile/lib/sessionCheckpointStore.ts` · `lib/pendingSessionQueue.ts`
- Test: `apps/mobile/lib/__tests__/sessionCheckpointStore.test.ts` · `__tests__/pendingSessionQueue.test.ts`
- Modify: `apps/mobile/package.json`은 이미 expo-file-system 추가됨(작업트리) — 이 태스크 커밋에 포함

**Interfaces:**

- Produces:

```ts
// sessionFileStore.ts
export interface SessionFileStore {
  read(path: string): Promise<string | null>; // 없으면 null
  writeAtomic(path: string, contents: string): Promise<void>; // 임시 파일 쓰기 → rename 교체
  remove(path: string): Promise<void>; // 없어도 조용히 성공
  list(dirPath: string): Promise<string[]>; // 파일명 배열, 디렉터리 없으면 []
}
export const sessionFileStore: SessionFileStore; // expo-file-system 구현체
```

```ts
// sessionCheckpointStore.ts  (경로: focuson/checkpoint.json)
saveCheckpoint(checkpoint: SessionCheckpoint, store?: SessionFileStore): Promise<void>
readCheckpoint(store?): Promise<SessionCheckpoint | null>  // 파싱 실패·schemaVersion≠1 → 손상 파일 삭제 후 null
clearCheckpoint(store?): Promise<void>
```

```ts
// pendingSessionQueue.ts  (경로: focuson/pending/{sessionId}.json)
export interface PendingSession { sessionId: string; payload: SubmitPayload; }
enqueuePendingSession(item: PendingSession, store?): Promise<void>
listPendingSessions(store?): Promise<PendingSession[]>   // 손상 파일은 삭제+warn 후 건너뜀
removePendingSession(sessionId: string, store?): Promise<void>
```

- [ ] **Step 1: 실패하는 테스트** — 인메모리 fake로 로직 전부 검증. 공용 fake(각 테스트 파일 안에 정의, ~15줄):

```ts
function createFakeStore(): SessionFileStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (path) => files.get(path) ?? null,
    writeAtomic: async (path, contents) => void files.set(path, contents),
    remove: async (path) => void files.delete(path),
    list: async (dir) =>
      [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)),
  };
}
```

케이스 — 체크포인트: ① save→read 왕복 ② 덮어쓰기(항상 최신 1개) ③ 손상 JSON→null+파일 삭제 ④ schemaVersion 불일치→null ⑤ clear 후 null. 큐: ① enqueue→list 왕복 ② 세션 2개 독립 저장 ③ remove는 해당 세션만 제거 ④ 손상 파일은 건너뛰고 나머지 반환+손상 파일 삭제.

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- sessionCheckpointStore pendingSessionQueue` / Expected: FAIL
- [ ] **Step 3: 구현** — 어댑터는 expo-file-system v19 API로(설치본 문서 확인 — 새 `File`/`Directory`/`Paths` API 사용, 더 단순하면 `expo-file-system/legacy`의 `writeAsStringAsync`+`moveAsync` 허용. 반드시 `documentDirectory` 계열 하위 `focuson/`). 어댑터에는 분기·로직을 두지 않는다:

```ts
// ponytail: 어댑터는 로직 0줄 유지 — 단위 테스트 없음(로직은 스토어·큐에서 fake로 검증,
// 실기기 검증은 브리지 연결 티켓의 E2E). expo-file-system API 변경 시 이 파일만 고친다.
```

`writeAtomic`은 `{path}.tmp`에 쓴 뒤 rename/move(덮어쓰기)로 교체. 스토어·큐 구현은 인터페이스 계약대로(손상 처리 포함, `console.warn` 로그).

- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test` / Expected: PASS (전체 스위트)
- [ ] **Step 5: Commit** — `git add apps/mobile packages -A && git commit -m "feat(session): 체크포인트 저장소·미제출 큐 구현 (BY-291)"` (expo-file-system package.json·lock 포함)

---

### Task 5: 제출·재전송·복구 오케스트레이션 + 앱 배선

**Files:**

- Create: `apps/mobile/lib/studySessionApi.ts` · `lib/sessionSync.ts`
- Modify: `apps/mobile/app/_layout.tsx` (포그라운드 훅 1곳)
- Test: `apps/mobile/lib/__tests__/studySessionApi.test.ts` · `__tests__/sessionSync.test.ts`

**Interfaces:**

- Produces:

```ts
// studySessionApi.ts — statsApi 패턴(Constants apiBaseUrl·parseErrorMessage) 준수
export class StudySessionSubmitError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
submitStudySession(userId: number, payload: SubmitPayload): Promise<StudySessionResponse[]>
// !res.ok → parseErrorMessage 메시지로 StudySessionSubmitError(status) throw
```

```ts
// sessionSync.ts
completePendingCheckpoint(nowMs: number, store?): Promise<"none" | "restorable" | "enqueued">
//  readCheckpoint → null이면 "none" · closeOutCheckpoint restore면 체크포인트 유지 "restorable"
//  · finalized면 buildSubmitPayload→enqueue→clearCheckpoint "enqueued"

flushPendingSessions(userId: number, store?): Promise<{ submitted: number; kept: number; dropped: number }>
//  listPendingSessions → 각각 submit: 성공→remove·submitted++ ·
//  StudySessionSubmitError 4xx→remove+console.warn·dropped++ · 그 외(네트워크·5xx)→유지·kept++

syncSessionsOnAppActive(invalidate: () => void, nowMs?: number, store?): Promise<void>
//  ensureUserRegistered → null이면 종료 · completePendingCheckpoint(nowMs ?? Date.now()) ·
//  flush → submitted > 0이면 invalidate() 호출. 모든 오류는 삼키고 warn(사용자 노출 금지)
```

- `_layout.tsx`: 기존 AppState 리스너의 `state === "active"` 분기 + 마운트 1회에 `void syncSessionsOnAppActive(() => queryClient.invalidateQueries({ queryKey: statsKeys.all }))` 호출 (통계 갱신은 BY-313 쿼리 레이어 재사용). 기존 주석·구조 유지, 최소 수정.

- [ ] **Step 1: 실패하는 테스트** — studySessionApi: statsApi.test 패턴(fetch mock)으로 ① 성공 POST(URL·헤더·바디 JSON) ② 400 → StudySessionSubmitError(status=400)+서버 메시지 ③ 네트워크 오류 전파. sessionSync(fake store + jest.mock userApi/studySessionApi): ① 체크포인트 없음→"none" ② restore 갈래→체크포인트 유지 ③ finalized→큐 편입+체크포인트 삭제 ④ flush 성공→큐 제거+invalidate 1회 ⑤ 400→큐 제거(dropped)+invalidate 안 함(submitted 0일 때) ⑥ 네트워크 오류→큐 유지(kept)·오류 삼킴 ⑦ userId null→아무 것도 안 함.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter mobile test -- studySessionApi sessionSync` / Expected: FAIL
- [ ] **Step 3: 구현** — 위 인터페이스 계약대로. `_layout.tsx` 수정은 기존 AppState useEffect 안에 3~4줄(액티브 시 호출)과 마운트 useEffect 1줄.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test` / Expected: PASS 전체
- [ ] **Step 5: Commit** — `git commit -m "feat(session): 세션 제출·재전송·소급 복구 배선 (BY-291)"`

---

### Task 6: 스펙 표기 정정 + 전체 검증

**Files:**

- Modify: `docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md` — "기본 5분" 2곳(6절·12절)을 "기본 20분"으로 (위키 2026-07-26 확정 우선. 주의: PR #13도 이 문서를 수정하므로 **해당 줄만** 최소 수정)

- [ ] **Step 1: 표기 수정** — 6절 "자동 종료 대기 시간 N은 기본 5분" → "기본 20분", 12절 "(기본 5분으로 시작)" → "(기본 20분으로 시작)". 다른 줄 수정 금지.
- [ ] **Step 2: 전체 검증** — Run: `pnpm turbo run lint typecheck test` (16개 태스크 — study-core 추가) 전부 PASS · 브랜치 변경 파일 `pnpm exec prettier --check` PASS
- [ ] **Step 3: Commit** — `git add docs && git commit -m "docs(session): 일시정지 자동 종료 기본값 20분으로 정정 (BY-291)"`

## Self-Review 결과

- 티켓 완료 조건 대조: 타입(T1)·타이머 산출+부등식 성질검사(T2)·소급 마감 3갈래+우선순위 닫기(T3? → T2)·페이로드 0ms 제외·ISO(T3)·원자적 쓰기·세션당 큐(T4)·saveCheckpoint 입구(T4)·제출·400/5xx 규칙·재전송 트리거·복구 편입·invalidate·사용자 오류 미노출(T5)·N=20분 상수+스펙 정정(T2·T6)·전 로직 테스트(전 태스크). 브리지·알림·웹 이관·BY-316은 범위 밖 유지.
- 타입 일관성: `SessionCheckpoint`(T1)→T2·T3·T4·T5 소비 · `CloseoutResult.finalized`(T2)→`buildSubmitPayload` 인자(T3)→`completePendingCheckpoint`(T5) · `SubmitPayload`(T3)→`PendingSession`(T4)→`submitStudySession`(T5) · `SessionFileStore`(T4)→T5의 store 주입.
- PR #13 충돌 면: 신규 파일만 + `_layout.tsx`(우리 소유 변경분)·스펙 문서 2줄·package.json 의존성 1줄 — 관리 가능 범위로 유지.
