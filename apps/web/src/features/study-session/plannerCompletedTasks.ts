import type { QueryClient } from "@tanstack/react-query";
import { plannerDateKeyOf } from "@/features/planner/plannerDay";
import { deviceTimeZone } from "@/lib/dateKey";
import { listPlannerDays } from "@/lib/plannerApi";
import { plannerKeys } from "@/lib/plannerQueries";
import { reportHandled } from "@/lib/sentry";
export async function plannerCompletedTaskIds(
  client: QueryClient,
  userId: number,
  startedAtMs: number,
): Promise<number[] | undefined> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readCompletedTaskIds(client, userId, startedAtMs, controller.signal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("planner completed task lookup timed out"));
        }, 3000);
      }),
    ]);
  } catch (error) {
    reportHandled(error, "planner-completed-tasks");
    return undefined;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function readCompletedTaskIds(
  client: QueryClient,
  userId: number,
  startedAtMs: number,
  signal: AbortSignal,
): Promise<number[]> {
  const cache = client.getMutationCache();
  const pending = () =>
    cache.findAll({ mutationKey: plannerKeys.user(userId), status: "pending" }).length > 0;
  if (pending())
    await new Promise<void>((resolve) => {
      const finish = () => {
        stop();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const stop = cache.subscribe(() => {
        if (!pending()) finish();
      });
      signal.addEventListener("abort", finish, { once: true });
      if (!pending() || signal.aborted) finish();
    });
  if (signal.aborted) throw new Error("planner completed task lookup aborted");
  const timeZone = deviceTimeZone();
  const dates = [
    plannerDateKeyOf(new Date(startedAtMs), timeZone),
    plannerDateKeyOf(new Date(), timeZone),
  ].sort();
  const days = await listPlannerDays({ from: dates[0]!, to: dates[1]! }, { timeZone, signal });
  return [
    ...new Set(
      days.flatMap((day) =>
        day.subjects.flatMap((subject) =>
          subject.tasks.flatMap((task) =>
            task.taskId !== null &&
            task.done &&
            task.doneAt !== null &&
            Date.parse(task.doneAt) >= startedAtMs
              ? [task.taskId]
              : [],
          ),
        ),
      ),
    ),
  ];
}
