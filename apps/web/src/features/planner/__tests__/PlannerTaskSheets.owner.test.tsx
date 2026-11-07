import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as tokenSource from "@/lib/auth/tokenSource";
import type { AuthSnapshot } from "@/lib/auth/tokenSource";
import { plannerDay, plannerSubject } from "@/test/plannerFixtures";
import { PlannerTaskSheets } from "../PlannerTaskSheets";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "복수 과목 추가의 첫 저장 성공 뒤 계정 변경=%s이면 후속 저장을 원래 계정에 묶는다",
  async (changed) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let snapshot: AuthSnapshot = { userId: 7, accessToken: "account-a" };
    const listeners = new Set<(value: AuthSnapshot) => void>();
    vi.spyOn(tokenSource, "getTokenSource").mockReturnValue({
      getUserId: () => snapshot.userId,
      getCurrentToken: () => snapshot.accessToken,
      getAccessToken: async () => snapshot.accessToken,
      refresh: async () => snapshot.accessToken,
      hasSettled: () => true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
    const subjects = [
      plannerSubject({ id: 8, name: "영어" }),
      plannerSubject({ id: 9, name: "물리학" }),
    ];
    const writes: { url: string; token: string | null }[] = [];
    let releaseRefresh: (() => void) | undefined;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const token = new Headers(init?.headers).get("Authorization");
      if (init?.method === "PUT") {
        writes.push({ url, token });
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/api/subjects")) {
        // First PUT has succeeded. Keep its onSuccess invalidation pending so the
        // account changes before the UI's loop starts the second mutation.
        if (writes.length === 1 && token === "Bearer account-a") {
          return new Promise<Response>((resolve) => {
            releaseRefresh = () => resolve(Response.json(subjects));
          });
        }
        return Response.json(subjects);
      }
      return Response.json(plannerDay({ subjects: [plannerSubject()] }));
    });
    vi.stubGlobal("fetch", request);
    const view = (userId: number) => (
      <QueryClientProvider client={client}>
        <PlannerTaskSheets
          open
          onOpenChange={() => {}}
          userId={userId}
          dateKey="2026-11-06"
          todayKey="2026-11-05"
          task={null}
          subjectId={3}
          subjects={[plannerSubject()]}
          onStudyStart={() => {}}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(7));
    await userEvent.click(screen.getByRole("button", { name: "과목" }));
    await userEvent.click(await screen.findByRole("button", { name: "영어" }));
    await userEvent.click(screen.getByRole("button", { name: "물리학" }));
    await userEvent.click(screen.getByRole("button", { name: "2개 추가" }));
    await waitFor(() => expect(releaseRefresh).toBeDefined());
    expect(writes).toEqual([
      {
        url: "/api/planner/days/2026-11-06/subjects/8?timeZone=Asia%2FSeoul",
        token: "Bearer account-a",
      },
    ]);
    act(() => {
      snapshot = {
        userId: changed ? 10 : 7,
        accessToken: changed ? "account-b" : "account-a-renewed",
      };
      for (const listener of [...listeners]) listener(snapshot);
    });
    rerender(view(changed ? 10 : 7));
    await act(async () => {
      releaseRefresh!();
    });
    if (changed) {
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(writes).toHaveLength(1);
      expect(screen.getByRole("button", { name: "2개 추가" })).toBeEnabled();
    } else {
      expect(await screen.findByRole("textbox", { name: "할 일 이름" })).toBeVisible();
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual({
        url: "/api/planner/days/2026-11-06/subjects/9?timeZone=Asia%2FSeoul",
        token: "Bearer account-a-renewed",
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
    client.clear();
  },
);
