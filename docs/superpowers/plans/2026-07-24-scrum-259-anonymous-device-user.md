# SCRUM-259 익명 기기 유저 등록 API 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 최초 실행 시 기기 UUID를 발급·SecureStore에 보관하고 `POST /api/users`로 서버에 등록해 `userId`를 로컬에 저장한다.

**Architecture:** `apps/mobile/lib/`에 순수 유틸 2개(`deviceId.ts`, `userApi.ts`)를 추가하고 `app/_layout.tsx` 부팅 시점에 fail-soft로 1회 실행한다. API 계약 타입은 `packages/types`에 둔다. 스펙: `docs/superpowers/specs/2026-07-24-scrum-259-anonymous-device-user-design.md`.

**Tech Stack:** Expo SDK 57 (expo-router), expo-secure-store, expo-crypto, 내장 fetch, jest-expo.

## Global Constraints

- 패키지 매니저는 pnpm 고정. 의존성 추가는 `pnpm --filter mobile exec expo install <pkg>`로만 (SDK 57 호환 버전 자동 선택).
- 신규 의존성은 `expo-secure-store`, `expo-crypto` 2개뿐. HTTP 클라이언트(axios 등) 추가 금지 — 내장 `fetch` 사용.
- TypeScript strict. 타입 전용 import는 `import type`.
- 커밋 메시지: `<type>(<scope>): <제목> (SCRUM-259)` — commitlint가 기본 Conventional Commits 타입만 허용.
- 보호 경로 건드리지 말 것: `apps/mobile/platform/**`, `apps/mobile/features/study-session/**`, `packages/study-core/**`, `apps/mobile/app/room/[id].tsx`.
- 개발/테스트 서버 `http://52.78.219.53:8080`은 직접 호출 테스트 허용됨 (사용자 승인).
- 모든 명령은 리포 루트 `C:\Users\wonza\Desktop\Wonil\projects\focuson\fe`에서 실행.

---

### Task 1: `packages/types` — 유저 등록 API 계약 타입

**Files:**

- Modify: `packages/types/src/index.ts` (파일 끝에 추가)

**Interfaces:**

- Consumes: 없음
- Produces: `UserRegisterRequest { deviceId: string }`, `UserRegisterResponse { userId: number; isNew: boolean }` — Task 3이 `import type { UserRegisterResponse } from "@focuson/types"`로 사용.

- [ ] **Step 1: 타입 추가**

`packages/types/src/index.ts` 파일 끝에 추가:

```ts
/**
 * 익명 기기 유저 등록 API 계약 (POST /api/users).
 * 로그인 없는 V1.0에서 기기 UUID로 사용자를 식별한다 — 근거:
 * .ai/notes/2026-07-23-로그인-도입-시점-변경.md
 */
export interface UserRegisterRequest {
  /** 앱이 첫 실행 때 생성해 기기 보안 저장소에 보관하는 UUID. 서버가 소문자로 정규화한다. */
  deviceId: string;
}

export interface UserRegisterResponse {
  /** 발급된 유저 ID — 이후 모든 API 호출에 사용 */
  userId: number;
  /** 신규 생성이면 true(HTTP 201), 기존 기기 재등록이면 false(HTTP 200) */
  isNew: boolean;
}
```

- [ ] **Step 2: typecheck 통과 확인**

Run: `pnpm --filter @focuson/types typecheck`
Expected: 에러 없이 종료.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): 익명 기기 유저 등록 API 타입 추가 (SCRUM-259)"
```

---

### Task 2: `deviceId.ts` — 기기 UUID get-or-create

**Files:**

- Create: `apps/mobile/lib/deviceId.ts`
- Test: `apps/mobile/lib/__tests__/deviceId.test.ts`

**Interfaces:**

- Consumes: `expo-secure-store`(`getItemAsync`/`setItemAsync`), `expo-crypto`(`randomUUID`)
- Produces: `getOrCreateDeviceId(): Promise<string>` — Task 3이 사용.

- [ ] **Step 1: 의존성 설치 (이 태스크의 전제)**

```bash
pnpm --filter mobile exec expo install expo-secure-store expo-crypto
```

설치 후 `apps/mobile/package.json`의 dependencies에 두 패키지가 `~`버전으로 추가됐는지 확인. `app.json`의 `plugins`에 `expo-secure-store`가 자동 추가될 수 있는데, 추가돼 있어도 그대로 둔다.

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/deviceId.test.ts`:

```ts
import * as SecureStore from "expo-secure-store";

import { getOrCreateDeviceId } from "../deviceId";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "0f8fad5b-d9cb-469f-a165-70867728950e"),
}));

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;

describe("getOrCreateDeviceId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("저장된 UUID가 있으면 그대로 반환하고 새로 만들지 않는다", async () => {
    mockedGet.mockResolvedValue("11111111-2222-3333-4444-555555555555");

    await expect(getOrCreateDeviceId()).resolves.toBe("11111111-2222-3333-4444-555555555555");
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("저장된 UUID가 없으면 생성해서 저장 후 반환한다", async () => {
    mockedGet.mockResolvedValue(null);

    await expect(getOrCreateDeviceId()).resolves.toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(mockedSet).toHaveBeenCalledWith(
      "focuson.deviceId",
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `pnpm --filter mobile test -- deviceId`
Expected: FAIL — `Cannot find module '../deviceId'`.

- [ ] **Step 4: 최소 구현**

`apps/mobile/lib/deviceId.ts`:

```ts
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "focuson.deviceId";

/**
 * 기기 식별 UUID를 SecureStore에서 조회하고, 없으면 생성해 저장한다.
 * 앱 삭제 시 UUID가 사라지면 기존 데이터와 재연결 불가 — 익명 계정 방식의
 * 알려진 한계 (스펙 참고).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const deviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter mobile test -- deviceId`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json pnpm-lock.yaml apps/mobile/lib/deviceId.ts apps/mobile/lib/__tests__/deviceId.test.ts
git commit -m "feat(mobile): 기기 UUID 발급·보관 유틸 추가 (SCRUM-259)"
```

(`apps/mobile/app.json`은 `expo install`이 plugins를 수정한 경우에만 스테이징 대상이다 — `git status`로 확인 후 변경된 파일만 add.)

---

### Task 3: `userApi.ts` — 등록 API 호출 + userId 보관

**Files:**

- Create: `apps/mobile/lib/userApi.ts`
- Modify: `apps/mobile/app.json` (`extra.apiBaseUrl` 추가)
- Test: `apps/mobile/lib/__tests__/userApi.test.ts`

**Interfaces:**

- Consumes: Task 1의 `UserRegisterResponse`, Task 2의 `getOrCreateDeviceId(): Promise<string>`
- Produces: `ensureUserRegistered(): Promise<number | null>` — Task 4가 사용. 성공 시 userId, 실패 시 null(fail-soft, throw 안 함). `registerUser(deviceId: string): Promise<UserRegisterResponse>`도 export — 스펙 완료 조건 "isNew 구분 가능하도록 값 노출"을 충족 (향후 온보딩 분기 티켓이 소비).

- [ ] **Step 1: `app.json`에 apiBaseUrl 추가**

`apps/mobile/app.json`의 `extra`를 다음으로 수정:

```json
    "extra": {
      "webAppUrl": "http://localhost:5173",
      "apiBaseUrl": "http://52.78.219.53:8080"
    }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/mobile/lib/__tests__/userApi.test.ts`:

```ts
import * as SecureStore from "expo-secure-store";

import { ensureUserRegistered } from "../userApi";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "http://api.test" } } },
}));
jest.mock("../deviceId", () => ({
  getOrCreateDeviceId: jest.fn(async () => "0f8fad5b-d9cb-469f-a165-70867728950e"),
}));

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedFetch = jest.fn();
global.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("ensureUserRegistered", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("저장된 userId가 있으면 네트워크 호출 없이 반환한다", async () => {
    mockedGet.mockResolvedValue("42");

    await expect(ensureUserRegistered()).resolves.toBe(42);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("신규 등록(201) 시 userId를 저장하고 반환한다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(201, { userId: 7, isNew: true }));

    await expect(ensureUserRegistered()).resolves.toBe(7);
    expect(mockedFetch).toHaveBeenCalledWith("http://api.test/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "0f8fad5b-d9cb-469f-a165-70867728950e" }),
    });
    expect(mockedSet).toHaveBeenCalledWith("focuson.userId", "7");
  });

  it("재등록(200, isNew=false)도 동일하게 userId를 저장한다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(jsonResponse(200, { userId: 7, isNew: false }));

    await expect(ensureUserRegistered()).resolves.toBe(7);
    expect(mockedSet).toHaveBeenCalledWith("focuson.userId", "7");
  });

  it("400 응답이면 null을 반환하고 throw 하지 않는다 (fail-soft)", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockResolvedValue(
      jsonResponse(400, { message: "deviceId: UUID 형식이어야 합니다" }),
    );

    await expect(ensureUserRegistered()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("네트워크 오류여도 null을 반환하고 throw 하지 않는다 (fail-soft)", async () => {
    mockedGet.mockResolvedValue(null);
    mockedFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(ensureUserRegistered()).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `pnpm --filter mobile test -- userApi`
Expected: FAIL — `Cannot find module '../userApi'`.

- [ ] **Step 4: 최소 구현**

`apps/mobile/lib/userApi.ts`:

```ts
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { UserRegisterResponse } from "@focuson/types";

import { getOrCreateDeviceId } from "./deviceId";

const USER_ID_KEY = "focuson.userId";

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) {
    throw new Error("app.json extra.apiBaseUrl이 설정되지 않았습니다");
  }
  return url;
}

/** 등록 API 원본 호출. 응답의 `isNew`가 필요한 소비자(온보딩 분기 등)는 이걸 쓴다. */
export async function registerUser(deviceId: string): Promise<UserRegisterResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `유저 등록 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as UserRegisterResponse;
}

/**
 * 익명 기기 유저 등록을 보장한다. 이미 등록돼 있으면 저장된 userId를 반환하고,
 * 아니면 기기 UUID로 등록 후 저장한다. 실패해도 throw 하지 않고 null을
 * 반환한다 — 다음 앱 실행 때 재시도 (등록 API는 멱등이라 안전, 스펙 참고).
 */
export async function ensureUserRegistered(): Promise<number | null> {
  try {
    const stored = await SecureStore.getItemAsync(USER_ID_KEY);
    if (stored) {
      return Number(stored);
    }
    const deviceId = await getOrCreateDeviceId();
    const { userId } = await registerUser(deviceId);
    await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
    return userId;
  } catch (error) {
    console.warn("[user] 익명 유저 등록 실패 — 다음 실행에서 재시도", error);
    return null;
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter mobile test -- userApi`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app.json apps/mobile/lib/userApi.ts apps/mobile/lib/__tests__/userApi.test.ts
git commit -m "feat(mobile): 익명 기기 유저 등록 API 연동 (SCRUM-259)"
```

---

### Task 4: 부팅 시 등록 실행

**Files:**

- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**

- Consumes: Task 3의 `ensureUserRegistered(): Promise<number | null>`
- Produces: 없음 (부팅 부수효과)

- [ ] **Step 1: `_layout.tsx` 수정**

`apps/mobile/app/_layout.tsx` 전체를 다음으로 교체:

```tsx
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureUserRegistered } from "../lib/userApi";

export default function RootLayout() {
  useEffect(() => {
    void ensureUserRegistered();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="room/[id]" options={{ headerShown: true, title: "스터디룸" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 2: 전체 검증 (lint + typecheck + test)**

Run: `pnpm --filter mobile lint && pnpm --filter mobile typecheck && pnpm --filter mobile test`
Expected: 전부 통과. (`@focuson/types` typecheck은 Task 1에서 확인됨.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): 앱 부팅 시 익명 유저 등록 실행 (SCRUM-259)"
```

---

### Task 5: 개발 서버 대상 스모크 테스트

**Files:** 없음 (검증만 — 사용자가 dev 서버 직접 호출을 승인함)

**Interfaces:**

- Consumes: 개발 서버 `http://52.78.219.53:8080`의 `POST /api/users`
- Produces: 없음 (계약 검증 기록)

- [ ] **Step 1: 신규 등록(201) 확인**

Bash에서 실행:

```bash
UUID=$(node -e "console.log(require('crypto').randomUUID())")
echo "UUID=$UUID"
curl -s -w "\nHTTP %{http_code}\n" -X POST http://52.78.219.53:8080/api/users \
  -H "Content-Type: application/json" -d "{\"deviceId\":\"$UUID\"}"
```

Expected: `{"userId":<number>,"isNew":true}` + `HTTP 201`.

- [ ] **Step 2: 같은 UUID 재등록(200, 멱등) 확인**

같은 셸 세션에서 (또는 Step 1의 UUID를 복사해서):

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://52.78.219.53:8080/api/users \
  -H "Content-Type: application/json" -d "{\"deviceId\":\"$UUID\"}"
```

Expected: 같은 `userId`, `"isNew":false` + `HTTP 200`.

- [ ] **Step 3: 형식 오류(400) 확인**

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://52.78.219.53:8080/api/users \
  -H "Content-Type: application/json" -d '{"deviceId":"not-a-uuid"}'
```

Expected: `{"message":"deviceId: UUID 형식이어야 합니다"}` + `HTTP 400`.

- [ ] **Step 4: 결과 보고**

세 케이스의 실제 응답을 최종 보고에 포함한다. 커밋 없음 (코드 변경 없는 검증 태스크).
