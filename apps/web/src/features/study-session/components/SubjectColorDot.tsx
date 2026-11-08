import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";

/**
 * 과목 이름 앞의 과목 색 점
 *
 * 색만으로 과목을 알리지 않도록 과목은 바로 옆 이름이 알리고 점은 낭독에서 뺀다.
 * 이름이 길어 말줄임이 되어도 점 크기는 유지한다.
 */
export function SubjectColorDot({
  colorIndex,
  className,
}: {
  colorIndex: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="subject-color-dot"
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: subjectColorVar(colorIndex) }}
    />
  );
}
