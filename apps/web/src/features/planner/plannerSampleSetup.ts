import {
  createPlannerTask,
  getPlannerDay,
  selectPlannerSubject,
  type PlannerRequestOptions,
} from "@/lib/plannerApi";
import { createSubject, listSubjects } from "@/lib/subjectApi";
import { getTokenSource } from "@/lib/auth/tokenSource";

export async function startPlannerSample(
  date: string,
  samples: readonly { subject: string; task: string }[],
  options: PlannerRequestOptions,
): Promise<void> {
  const source = getTokenSource();
  const owner = source?.getUserId();
  const controller = new AbortController();
  const abort = () => controller.abort();
  // 신원이 바뀌면 진행 중 요청도 취소해 apiFetch가 새 계정의 토큰으로 401을 재시도하지 않게 한다.
  // 같은 계정의 access 토큰 갱신은 계속 허용한다.
  const unsubscribe = source?.subscribe((snapshot) => {
    if (snapshot.userId !== owner) abort();
  });
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const requestOptions = { ...options, signal: controller.signal };
  const checkOwner = () => {
    if (
      controller.signal.aborted ||
      getTokenSource() !== source ||
      (source !== null && (owner === null || source.getUserId() !== owner))
    ) {
      abort();
      throw new Error("planner sample identity changed or request aborted");
    }
  };
  try {
    checkOwner();
    const subjects = await listSubjects(requestOptions);
    for (const sample of samples) {
      checkOwner();
      let subject = subjects.find((value) => value.name === sample.subject);
      if (!subject) {
        subject = await createSubject({ name: sample.subject }, requestOptions);
        subjects.push(subject);
      }
      checkOwner();
      await selectPlannerSubject(date, subject.id, requestOptions);
      checkOwner();
      const day = await getPlannerDay(date, requestOptions);
      if (
        day.subjects.some(
          (value) =>
            value.id === subject.id && value.tasks.some((task) => task.name === sample.task),
        )
      )
        continue;
      checkOwner();
      await createPlannerTask({ subjectId: subject.id, date, name: sample.task }, requestOptions);
      checkOwner();
    }
  } finally {
    unsubscribe?.();
    options.signal?.removeEventListener("abort", abort);
  }
}
