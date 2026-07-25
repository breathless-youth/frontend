# SCRUM-147 최소 타이머 룸 + 세션 제출 API 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹에 최소 타이머 룸(`/room/:id`)을 만들고, 종료 시 `POST /api/study-sessions`로 세션을 제출해 서버 저장 결과를 화면에 표시한다.

**Architecture:** 측정은 순수 타이머(입장~퇴장)만 — Vision 없음, `studySec = focusSec = 세션 길이`, `events = []`. 제출 함수(`submitStudySession`)는 값을 계산하지 않고 받기만 한다(Vision 도입 시 확장 지점). userId는 `?userId=` 쿼리로 받는다.

**Tech Stack:** Vite + React 19.1 + react-router-dom 7, vitest + @testing-library/react(jsdom), 내장 fetch. 스펙: `docs/superpowers/specs/2026-07-25-scrum-147-minimal-room-session-submit-design.md`

## Global Constraints

- **작업 디렉터리는 워크트리**: 모든 명령은 `C:\Users\wonza\Desktop\Wonil\projects\focuson\fe-scrum-147`에서 실행 (브랜치 `feature/SCRUM-147-FE-공부-세션-제출-API-연동`)
- TypeScript strict, `any` 금지, 타입 전용 import는 `import type`
- 커밋 메시지: Conventional Commits + `(SCRUM-147)` 접미 (husky+commitlint가 강제)
- API 주소: `import.meta.env.VITE_API_BASE_URL ?? "http://52.78.219.53:8080"` (개발 서버 직접 테스트 허용)
- `apps/mobile`은 수정하지 않는다. 상태 이름에 `CAMERA_OFF`를 쓰지 않는다(`PAUSE`로 대체됨)
- 패키지 매니저 pnpm 고정

---

### Task 1: 세션 제출 API 계약 타입 (`packages/types`)

**Files:**
- Modify: `packages/types/src/index.ts` (파일 끝에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `StudyEventStatus`, `StatusEventPayload`, `StudySessionCreateRequest`, `StudySessionResponse` — Task 2·3이 `@focuson/types`에서 import

- [ ] **Step 1: 워크트리 의존성 설치 (최초 1회)**

Run: `pnpm install` (워크트리 루트에서. node_modules가 없는 신규 워크트리다)
Expected: 오류 없이 완료

- [ ] **Step 2: 타입 추가**

`packages/types/src/index.ts` 끝에 추가:

```ts
/**
 * 공부 세션 제출 API 계약 (POST /api/study-sessions) — Swagger 기준.
 * 서버는 세션을 실시간 추적하지 않고, 앱이 잰 studySec/focusSec을 그대로 저장한다.
 */

/**
 * 비공부 상태 이벤트 종류. PHONE=휴대폰 사용, DEVICE=다른 기기, AWAY=자리 비움,
 * PAUSE=일시정지(총공부 타이머까지 정지 — 나머지 셋은 순공 타이머만 정지).
 */
export type StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE";

/** 비공부 상태 이벤트 1건. 시각은 UTC ISO-8601, 세션 구간 안·서로 겹침 불가·0초 불가. */
export interface StatusEventPayload {
  status: StudyEventStatus;
  startedAt: string;
  endedAt: string;
}

export interface StudySessionCreateRequest {
  userId: number;
  /** 방 입장 시각 (UTC ISO-8601) */
  startedAt: string;
  /** 방 퇴장 시각 (UTC ISO-8601) — 시작 이후·24시간 이내·미래 불가(시계 오차 5분 허용) */
  endedAt: string;
  /** 총 공부 시간(초). 0 ≤ studySec ≤ (endedAt−startedAt)−PAUSE 시간 합 */
  studySec: number;
  /** 순공 시간(초). 0 ≤ focusSec ≤ studySec */
  focusSec: number;
  /** 비공부 상태 이벤트 목록 — 없으면 빈 배열 */
  events: StatusEventPayload[];
}

/** 저장 결과 세션 1건 — 자정(KST)을 넘는 제출은 날짜별로 분할되어 배열로 내려온다. */
export interface StudySessionResponse {
  id: number;
  userId: number;
  /** 통계 귀속 날짜 (KST 기준, YYYY-MM-DD) */
  statDate: string;
  startedAt: string;
  endedAt: string;
  studySec: number;
  focusSec: number;
  /** 집중률(%) = focusSec ÷ studySec × 100, 소수 1자리 */
  focusRate: number;
  events: StatusEventPayload[];
}
```

- [ ] **Step 3: typecheck 통과 확인**

Run: `pnpm --filter @focuson/types typecheck`
Expected: 오류 없음 (types 패키지에는 테스트 인프라가 없음 — typecheck가 검증 수단)

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): 공부 세션 제출 API 계약 타입 추가 (SCRUM-147)"
```

---

### Task 2: 제출 함수 `submitStudySession` (apps/web)

**Files:**
- Create: `apps/web/src/features/study-session/submitStudySession.ts`
- Test: `apps/web/src/features/study-session/__tests__/submitStudySession.test.ts`

**Interfaces:**
- Consumes: Task 1의 `StudySessionCreateRequest`, `StudySessionResponse`, `StatusEventPayload`
- Produces (Task 3이 사용):
  - `interface SessionInput { userId: number; startedAtMs: number; endedAtMs: number; studySec: number; focusSec: number; events?: StatusEventPayload[] }`
  - `buildSessionRequest(input: SessionInput): StudySessionCreateRequest`
  - `submitStudySession(input: SessionInput): Promise<StudySessionResponse[]>` — 실패 시 `Error(서버 message 또는 "세션 제출 실패 (HTTP n)")` throw

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/features/study-session/__tests__/submitStudySession.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSessionRequest, submitStudySession } from "../submitStudySession";

const BASE_INPUT = {
  userId: 1,
  startedAtMs: Date.UTC(2026, 6, 25, 1, 0, 0),
  endedAtMs: Date.UTC(2026, 6, 25, 2, 0, 0),
  studySec: 3600,
  focusSec: 3600,
};

describe("buildSessionRequest", () => {
  it("epoch ms를 UTC ISO-8601로 변환하고 events 기본값은 빈 배열이다", () => {
    const req = buildSessionRequest(BASE_INPUT);
    expect(req).toEqual({
      userId: 1,
      startedAt: "2026-07-25T01:00:00.000Z",
      endedAt: "2026-07-25T02:00:00.000Z",
      studySec: 3600,
      focusSec: 3600,
      events: [],
    });
  });

  it("studySec은 세션 길이로, focusSec은 studySec으로 클램프한다", () => {
    const req = buildSessionRequest({ ...BASE_INPUT, studySec: 99999, focusSec: 99999 });
    expect(req.studySec).toBe(3600);
    expect(req.focusSec).toBe(3600);
  });

  it("음수 입력은 0으로 클램프한다", () => {
    const req = buildSessionRequest({ ...BASE_INPUT, studySec: -5, focusSec: -5 });
    expect(req.studySec).toBe(0);
    expect(req.focusSec).toBe(0);
  });
});

describe("submitStudySession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("201이면 세션 배열을 반환한다", async () => {
    const sessions = [{ id: 10, userId: 1, statDate: "2026-07-25" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(sessions) }),
    );

    const result = await submitStudySession(BASE_INPUT);

    expect(result).toEqual(sessions);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/study-sessions$/);
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      userId: 1,
      studySec: 3600,
      events: [],
    });
  });

  it("400이면 서버 message로 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: "세션은 24시간을 초과할 수 없습니다" }),
      }),
    );

    await expect(submitStudySession(BASE_INPUT)).rejects.toThrow(
      "세션은 24시간을 초과할 수 없습니다",
    );
  });

  it("message 없는 실패면 HTTP 상태 코드로 throw한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error("no body")) }),
    );

    await expect(submitStudySession(BASE_INPUT)).rejects.toThrow("세션 제출 실패 (HTTP 500)");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter web test`
Expected: FAIL — `submitStudySession` 모듈이 없음

- [ ] **Step 3: 구현 작성**

`apps/web/src/features/study-session/submitStudySession.ts`:

```ts
import type {
  StatusEventPayload,
  StudySessionCreateRequest,
  StudySessionResponse,
} from "@focuson/types";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://52.78.219.53:8080";

/**
 * 세션 제출 입력. 이 모듈은 값을 계산하지 않고 받기만 한다 — 지금은 타이머 룸이
 * studySec=focusSec=세션 길이, events=[]를 넘기고, Vision 도입 시 실제 측정값이 꽂힌다.
 */
export interface SessionInput {
  userId: number;
  startedAtMs: number;
  endedAtMs: number;
  studySec: number;
  focusSec: number;
  events?: StatusEventPayload[];
}

/** 서버 검증 규칙 위반(400)을 예방하는 클램프 체인: 0 ≤ focusSec ≤ studySec ≤ 세션 길이. */
export function buildSessionRequest(input: SessionInput): StudySessionCreateRequest {
  const sessionSec = Math.max(0, Math.floor((input.endedAtMs - input.startedAtMs) / 1000));
  const studySec = Math.min(Math.max(0, input.studySec), sessionSec);
  const focusSec = Math.min(Math.max(0, input.focusSec), studySec);
  return {
    userId: input.userId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    studySec,
    focusSec,
    events: input.events ?? [],
  };
}

/** 응답은 항상 배열 — KST 자정을 넘는 세션은 날짜별 2개로 분할되어 내려온다. */
export async function submitStudySession(input: SessionInput): Promise<StudySessionResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/study-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSessionRequest(input)),
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `세션 제출 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionResponse[];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test`
Expected: PASS (submitStudySession 6개 + 기존 HomePage 1개)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/study-session
git commit -m "feat(web): 공부 세션 제출 함수 추가 (SCRUM-147)"
```

---

### Task 3: 타이머 룸 화면 `RoomPage` + 라우트 (apps/web)

**Files:**
- Create: `apps/web/src/routes/RoomPage.tsx`
- Modify: `apps/web/src/App.tsx` (룸 라우트 추가)
- Modify: `apps/web/src/routes/HomePage.tsx` (룸 진입 링크 복원)
- Modify: `apps/web/src/routes/__tests__/HomePage.test.tsx` (라우터 래핑 복원)
- Test: `apps/web/src/routes/__tests__/RoomPage.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `submitStudySession(input: SessionInput): Promise<StudySessionResponse[]>`
- Produces: `/room/:id?userId=N` 라우트 (외부 소비자 없음 — 수동 검증 대상)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/routes/__tests__/RoomPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { submitStudySession } from "@/features/study-session/submitStudySession";
import { RoomPage } from "../RoomPage";

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

function renderRoom(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomPage", () => {
  it("타이머와 종료 버튼을 렌더링한다", () => {
    renderRoom("/room/7?userId=1");

    expect(screen.getByText("스터디룸 #7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공부 종료" })).toBeInTheDocument();
  });

  it("종료 클릭 시 제출하고 서버 결과를 표시한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        statDate: "2026-07-25",
        startedAt: "2026-07-25T01:00:00Z",
        endedAt: "2026-07-25T02:00:00Z",
        studySec: 3600,
        focusSec: 3600,
        focusRate: 100,
        events: [],
      },
    ]);
    renderRoom("/room/7?userId=1");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("2026-07-25")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(vi.mocked(submitStudySession).mock.calls[0]![0]).toMatchObject({
      userId: 1,
      events: [],
    });
  });

  it("제출 실패 시 메시지와 재시도 버튼을 보여준다", async () => {
    vi.mocked(submitStudySession).mockRejectedValueOnce(new Error("존재하지 않는 사용자입니다: 999"));
    renderRoom("/room/7?userId=999");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText("존재하지 않는 사용자입니다: 999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 제출" })).toBeInTheDocument();
  });

  it("userId가 없으면 제출 없이 저장 안 됨 안내를 보여준다", async () => {
    renderRoom("/room/7");

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));

    expect(await screen.findByText(/서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(vi.mocked(submitStudySession)).not.toHaveBeenCalled();
  });
});
```

주의: `@testing-library/user-event`가 devDependency에 없으면 먼저 추가한다:
`pnpm --filter web add -D @testing-library/user-event`

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter web test`
Expected: FAIL — `RoomPage` 모듈이 없음

- [ ] **Step 3: RoomPage 구현**

`apps/web/src/routes/RoomPage.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import type { StudySessionResponse } from "@focuson/types";

import { submitStudySession } from "@/features/study-session/submitStudySession";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Phase =
  | { name: "studying" }
  | { name: "submitting" }
  | { name: "done"; sessions: StudySessionResponse[] }
  | { name: "error"; message: string }
  | { name: "unsaved"; studySec: number };

/**
 * 최소 타이머 룸(디자인 미적용, SCRUM-147). 측정은 입장~퇴장 타이머뿐이라
 * studySec = focusSec = 세션 길이, events = []로 제출한다 — Vision 도입 시
 * 이 값들만 실제 측정값으로 교체한다(제출 경로는 submitStudySession 그대로).
 */
export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const parsedUserId = Number(searchParams.get("userId"));
  const userId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;

  const startedAtMsRef = useRef(Date.now());
  // 최초 종료 클릭 시점에 고정 — 재시도해도 같은 세션으로 멱등 제출되게 한다.
  const endedAtMsRef = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "studying" });

  useEffect(() => {
    if (phase.name !== "studying") {
      return;
    }
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAtMsRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase.name]);

  async function endAndSubmit() {
    endedAtMsRef.current ??= Date.now();
    const endedAtMs = endedAtMsRef.current;
    const studySec = Math.floor((endedAtMs - startedAtMsRef.current) / 1000);
    if (userId === null) {
      setPhase({ name: "unsaved", studySec });
      return;
    }
    setPhase({ name: "submitting" });
    try {
      const sessions = await submitStudySession({
        userId,
        startedAtMs: startedAtMsRef.current,
        endedAtMs,
        studySec,
        focusSec: studySec,
        events: [],
      });
      setPhase({ name: "done", sessions });
    } catch (error) {
      setPhase({
        name: "error",
        message: error instanceof Error ? error.message : "세션 제출에 실패했습니다",
      });
    }
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-medium">스터디룸 #{id}</h1>

      {phase.name === "studying" && (
        <>
          <p className="font-mono text-4xl font-semibold">{formatElapsed(elapsedSec)}</p>
          {userId === null && (
            <p className="text-muted-foreground text-xs">
              userId가 없어 이 세션은 서버에 저장되지 않습니다 (주소에 ?userId=N 필요)
            </p>
          )}
          <button
            type="button"
            onClick={() => void endAndSubmit()}
            className="rounded-full bg-black px-6 py-3 text-white"
          >
            공부 종료
          </button>
        </>
      )}

      {phase.name === "submitting" && <p className="text-sm">저장 중...</p>}

      {phase.name === "done" &&
        phase.sessions.map((session) => (
          <div key={session.id} className="border-border w-full max-w-md rounded-2xl border p-4">
            <p className="text-muted-foreground text-sm">귀속 날짜</p>
            <p className="text-xl font-semibold">{session.statDate}</p>
            <p className="text-muted-foreground mt-2 text-sm">총 공부 시간</p>
            <p className="text-xl font-semibold">{formatElapsed(session.studySec)}</p>
            <p className="text-muted-foreground mt-2 text-sm">순공 시간</p>
            <p className="text-xl font-semibold">{formatElapsed(session.focusSec)}</p>
            <p className="text-muted-foreground mt-2 text-sm">집중률</p>
            <p className="text-xl font-semibold">{session.focusRate}%</p>
          </div>
        ))}

      {phase.name === "error" && (
        <>
          <p className="text-sm text-red-600">{phase.message}</p>
          <button
            type="button"
            onClick={() => void endAndSubmit()}
            className="rounded-full bg-black px-6 py-3 text-white"
          >
            다시 제출
          </button>
        </>
      )}

      {phase.name === "unsaved" && (
        <p className="text-sm">
          공부 시간 {formatElapsed(phase.studySec)} — userId가 없어 서버에 저장되지 않았습니다.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: 라우트·홈 링크 복원**

`apps/web/src/App.tsx` 전체를 다음으로 교체:

```tsx
import { Route, Routes } from "react-router-dom";

import { HomePage } from "@/routes/HomePage";
import { RoomPage } from "@/routes/RoomPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:id" element={<RoomPage />} />
    </Routes>
  );
}
```

`apps/web/src/routes/HomePage.tsx` 전체를 다음으로 교체:

```tsx
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";

export function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">FocusOn</h1>
      <p className="text-muted-foreground text-sm">AI 비전 기반 순공 시간 측정 캠스터디</p>
      <Link to="/room/demo" className={buttonVariants()}>
        스터디룸 입장 (데모)
      </Link>
    </main>
  );
}
```

`apps/web/src/routes/__tests__/HomePage.test.tsx` 전체를 다음으로 교체(Link 사용으로 라우터 래핑 필요):

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HomePage } from "../HomePage";

describe("HomePage", () => {
  it("renders the service name and entry link", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("FocusOn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /스터디룸 입장/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter web test`
Expected: PASS (RoomPage 4개 + submitStudySession 6개 + HomePage 1개)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): 최소 타이머 룸 화면과 세션 제출 플로우 추가 (SCRUM-147)"
```

---

### Task 4: 전체 검증 + 개발 서버 스모크 테스트

**Files:**
- 수정 없음 (검증 전용 — 실패 시 원인 파일 수정 후 fix 커밋)

**Interfaces:**
- Consumes: Task 1~3 전체
- Produces: 검증 완료된 브랜치

- [ ] **Step 1: 모노레포 전체 검증**

Run: `pnpm lint && pnpm typecheck && pnpm test` (워크트리 루트)
Expected: 전 태스크 성공

- [ ] **Step 2: 개발 서버 계약 스모크 테스트 (curl)**

```bash
# 201 — 정상 제출 (userId 1은 등록돼 있음). 시각은 실행 시점 기준 과거 1시간으로 조정할 것
START=$(date -u -d '-1 hour' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')
END=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
curl -s -X POST http://52.78.219.53:8080/api/study-sessions -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"startedAt\":\"$START\",\"endedAt\":\"$END\",\"studySec\":3600,\"focusSec\":3600,\"events\":[]}"
# Expected: [{"id":...,"statDate":"...","studySec":3600,"focusSec":3600,"focusRate":100.0,...}]

# 404 — 미등록 userId
curl -s -X POST http://52.78.219.53:8080/api/study-sessions -H "Content-Type: application/json" \
  -d "{\"userId\":999999,\"startedAt\":\"$START\",\"endedAt\":\"$END\",\"studySec\":3600,\"focusSec\":3600,\"events\":[]}"
# Expected: {"message":"존재하지 않는 사용자입니다: 999999"}

# 400 — focusSec > studySec
curl -s -X POST http://52.78.219.53:8080/api/study-sessions -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"startedAt\":\"$START\",\"endedAt\":\"$END\",\"studySec\":100,\"focusSec\":200,\"events\":[]}"
# Expected: {"message":"순공 시간은 0 이상, 총 공부 시간 이하여야 합니다"}
```

- [ ] **Step 3: 수동 검증 안내를 사용자에게 전달**

`pnpm --filter web dev` 실행 → 브라우저에서 `http://localhost:5173/room/1?userId=1` →
잠시 대기 → "공부 종료" 클릭 → 결과 패널(귀속 날짜·총공부·순공·집중률)이 위 curl 201 응답과
같은 형식으로 표시되는지 확인. `?userId` 없이 접속하면 "저장되지 않습니다" 경고와
종료 시 로컬 요약이 보이는지도 확인.
