import type { SubjectResponse } from "@focusmakers/types";

/**
 * 이 세션에서 완료한 할 일 — 지금 들고 있는 과목 목록에서 `doneAt`이 세션 시작 이후인 것.
 *
 * 제출 시점에 파생한다(스냅샷·복원에 싣지 않는다). 앱이 죽었다 돌아와도 `doneAt`은 서버 값이라 목록을
 * 다시 받으면 그대로 살아난다. 목록을 한 번도 받지 않았으면(시트를 안 연 새 세션) 빈 배열이다 —
 * 그 세션에서는 체크할 수도 없었으니 맞다.
 *
 * 새 세션의 시작은 단말 `Date.now()`, `doneAt`은 서버 시각이라 시계가 어긋나면 세션 시작 직후 몇 초 안에
 * 완료한 할 일이 빠질 수 있다. 허용치는 두지 않는다 — 복원 세션은 서버 `startedAt`이라 어긋남이 없다.
 */
export function completedTaskIdsSince(
  subjects: readonly SubjectResponse[],
  startedAtMs: number,
): number[] {
  return subjects.flatMap((subject) =>
    subject.tasks.flatMap((task) => {
      if (task.doneAt === null) {
        return [];
      }
      const doneAtMs = Date.parse(task.doneAt);
      return Number.isFinite(doneAtMs) && doneAtMs >= startedAtMs ? [task.id] : [];
    }),
  );
}
