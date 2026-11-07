import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PlannerGoalSheet } from "../PlannerGoalSheet";
import * as tokenSource from "@/lib/auth/tokenSource";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("날짜 목표와 기본 목표 두 요청이 끝날 때까지 전체 입력·중복 저장·닫기를 막는다", async () => {
  const requests: string[] = [];
  const releases: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      await new Promise<void>((resolve) => releases.push(resolve));
      return Response.json({ goalSec: 14400, individualGoalSec: 14400, defaultGoalSec: 14400 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-06"
        goal={{ goalSec: null, individualGoalSec: null, defaultGoalSec: null }}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "4시간" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    releases[0]!();
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "30분 늘리기" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await userEvent.keyboard("{Escape}");
  expect(close).not.toHaveBeenCalled();
  expect(requests).toHaveLength(2);
  await act(async () => {
    releases[1]!();
  });
  await waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith(false));
  client.clear();
});
it("6시간에서 30분을 더하고 기본 목표를 함께 저장한다", async () => {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({ goalSec: 23400, individualGoalSec: 23400, defaultGoalSec: 23400 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet
        open
        onOpenChange={() => {}}
        userId={7}
        dateKey="2026-11-06"
        goal={{ goalSec: null, individualGoalSec: null, defaultGoalSec: null }}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "6시간" }));
  await userEvent.click(screen.getByRole("button", { name: "30분 늘리기" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() =>
    expect(requests).toEqual([
      { url: "/api/planner/goals/2026-11-06?timeZone=Asia%2FSeoul", body: { goalSec: 23400 } },
      { url: "/api/planner/goals/default?timeZone=Asia%2FSeoul", body: { goalSec: 23400 } },
    ]),
  );
  client.clear();
});

it("날짜 목표를 저장하는 사이 계정이 바뀌면 새 계정에 기본 목표를 저장하지 않는다", async () => {
  let owner = 7;
  let finish!: () => void;
  const source = {
    getUserId: () => owner,
    getAccessToken: async () => `token-${owner}`,
    getCurrentToken: () => `token-${owner}`,
    refresh: async () => `token-${owner}`,
    hasSettled: () => true,
    subscribe: () => () => {},
  };
  vi.spyOn(tokenSource, "getTokenSource").mockReturnValue(source);
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return Response.json({ goalSec: 14400, individualGoalSec: 14400, defaultGoalSec: null });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    dateKey: "2026-11-06",
    goal: { goalSec: null, individualGoalSec: null, defaultGoalSec: null },
  };
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet {...props} userId={7} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  owner = 8;
  rerender(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet {...props} userId={8} />
    </QueryClientProvider>,
  );
  await act(async () => finish());
  await screen.findByRole("alert");
  expect(requests).toHaveLength(1);
  expect(props.onOpenChange).not.toHaveBeenCalled();
  client.clear();
  vi.restoreAllMocks();
});

it("같은 계정의 토큰이 갱신되면 기본 목표 저장을 계속한다", async () => {
  let token = "old-token";
  let finish!: () => void;
  const source = {
    getUserId: () => 7,
    getAccessToken: async () => token,
    getCurrentToken: () => token,
    refresh: async () => token,
    hasSettled: () => true,
    subscribe: () => () => {},
  };
  vi.spyOn(tokenSource, "getTokenSource").mockReturnValue(source);
  const tokens: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      tokens.push(new Headers(init?.headers).get("Authorization"));
      if (tokens.length === 1)
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return Response.json({ goalSec: 14400, individualGoalSec: 14400, defaultGoalSec: null });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-06"
        goal={{ goalSec: null, individualGoalSec: null, defaultGoalSec: null }}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(tokens).toHaveLength(1));
  token = "new-token";
  await act(async () => finish());
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  expect(tokens).toEqual(["Bearer old-token", "Bearer new-token"]);
  client.clear();
  vi.restoreAllMocks();
});

it("첫 목표 요청이 성공해도 그 사이 계정이 바뀌었다 돌아오면 기본 목표 저장을 중단한다", async () => {
  let owner = 7;
  let finish!: () => void;
  const listeners = new Set<
    (snapshot: { userId: number | null; accessToken: string | null }) => void
  >();
  const source = {
    getUserId: () => owner,
    getAccessToken: async () => `token-${owner}`,
    getCurrentToken: () => `token-${owner}`,
    refresh: async () => `token-${owner}`,
    hasSettled: () => true,
    subscribe: (
      listener: (snapshot: { userId: number | null; accessToken: string | null }) => void,
    ) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  vi.spyOn(tokenSource, "getTokenSource").mockReturnValue(source);
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return Response.json({ goalSec: 14400, individualGoalSec: 14400, defaultGoalSec: null });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlannerGoalSheet
        open
        onOpenChange={close}
        userId={7}
        dateKey="2026-11-06"
        goal={{ goalSec: null, individualGoalSec: null, defaultGoalSec: null }}
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "다른 날도 같은 목표로" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  owner = 8;
  listeners.forEach((listener) => listener({ userId: 8, accessToken: "token-8" }));
  owner = 7;
  listeners.forEach((listener) => listener({ userId: 7, accessToken: "token-7" }));
  await act(async () => finish());
  await screen.findByRole("alert");
  expect(requests).toHaveLength(1);
  expect(close).not.toHaveBeenCalled();
  expect(listeners.size).toBe(0);
  client.clear();
  vi.restoreAllMocks();
});
