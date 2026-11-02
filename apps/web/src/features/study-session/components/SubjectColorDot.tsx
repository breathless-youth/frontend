import { subjectColorVar } from "@/features/records/recordsTimetable";

/**
 * 과목 이름 앞의 과목 색 점
 *
 * 색만으로는 과목을 가리지 못하는 사람도 있어 낭독에서 빼고, 과목은 바로 옆 이름이 알린다.
 * 이름이 길어 말줄임이 되어도 점 크기는 그대로 둔다.
 */
export function SubjectColorDot({ colorIndex }: { colorIndex: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="subject-color-dot"
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: subjectColorVar(colorIndex) }}
    />
  );
}
