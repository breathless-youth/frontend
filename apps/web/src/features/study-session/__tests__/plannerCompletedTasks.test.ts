import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { listPlannerDays } from "@/lib/plannerApi";
import { plannerKeys } from "@/lib/plannerQueries";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { plannerCompletedTaskIds } from "../plannerCompletedTasks";
vi.mock("@/lib/plannerApi", () => ({ listPlannerDays: vi.fn() }));
it("완료 변경이 끝난 뒤 가상 회차가 받은 실제 번호를 제출한다", async () => {
  const client = new QueryClient();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const mutation = client
    .getMutationCache()
    .build(client, { mutationKey: plannerKeys.user(7), mutationFn: () => waiting });
  const executing = mutation.execute(undefined);
  vi.mocked(listPlannerDays).mockResolvedValue([
    plannerDay({
      subjects: [
        plannerSubject({
          tasks: [
            plannerTask({ taskId: 42, done: true, doneAt: "2026-11-05T02:00:00Z" }),
            plannerTask({ taskId: null, done: false }),
          ],
        }),
      ],
    }),
  ]);
  const result = plannerCompletedTaskIds(client, 7, Date.parse("2026-11-05T01:00:00Z"));
  await Promise.resolve();
  expect(listPlannerDays).not.toHaveBeenCalled();
  finish();
  await executing;
  expect(await result).toEqual([42]);
  client.clear();
});

it("플래너 조회 실패 시 완료 번호를 생략해 공부 기록 제출을 계속한다", async () => {
  const client = new QueryClient();
  vi.mocked(listPlannerDays).mockRejectedValueOnce(new Error("planner unavailable"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(plannerCompletedTaskIds(client, 7, Date.now())).resolves.toBeUndefined();
  warn.mockRestore();
  client.clear();
});

it("플래너 조회가 멈추면 제한 시간 뒤 완료 번호를 생략한다", async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  vi.mocked(listPlannerDays).mockImplementationOnce(() => new Promise(() => {}));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = plannerCompletedTaskIds(client, 7, Date.now());
  await vi.advanceTimersByTimeAsync(3000);
  await expect(result).resolves.toBeUndefined();
  warn.mockRestore();
  client.clear();
  vi.useRealTimers();
});

it("완료 변경이 멈춰도 제한 시간 뒤 조회 대기를 끝낸다", async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  const mutation = client.getMutationCache().build(client, {
    mutationKey: plannerKeys.user(7),
    mutationFn: () => new Promise<void>(() => {}),
  });
  void mutation.execute(undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = plannerCompletedTaskIds(client, 7, Date.now());
  await vi.advanceTimersByTimeAsync(3000);
  await expect(result).resolves.toBeUndefined();
  warn.mockRestore();
  client.clear();
  vi.useRealTimers();
});
