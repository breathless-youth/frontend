import { formatElapsed, toKoreanDuration } from "@/features/study-session/formatDuration";
import { cn } from "@/lib/utils";

/**
 * 소셜룸 왼쪽 위 내 순공·총 공부 시간 글자
 *
 * 배경 없이 영상 위에 놓여 그림자로 글자를 띄운다.
 * 누를 수 없는 표시라 탭을 아래 화면으로 흘려보낸다.
 * 화면 숫자는 스크린리더가 그대로 읽으면 뜻이 안 통해 한글 문구를 따로 준다.
 * 조작이 숨으면 총 줄을 높이째 접어서 아래 과목 알약이 그 자리로 올라온다.
 */
export function RoomTimeText({
  focusSec,
  studySec,
  totalHidden = false,
}: {
  focusSec: number;
  studySec: number;
  totalHidden?: boolean;
}) {
  return (
    <div
      data-testid="room-time-text"
      className="pointer-events-none flex flex-col items-start tabular-nums text-shadow-[0_1px_3px_rgb(0_0_0/0.45)]"
    >
      <p className="text-[26px] leading-8 font-bold text-white regular:text-[31px] regular:leading-9.5 short-side-lg:text-[38px] short-side-lg:leading-12">
        <span aria-hidden="true">{formatElapsed(focusSec)}</span>
        <span className="sr-only">순공시간 {toKoreanDuration(focusSec)}</span>
      </p>
      <div
        data-testid="room-time-total"
        aria-hidden={totalHidden || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          totalHidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
        )}
      >
        <p className="overflow-hidden text-xs leading-4 font-bold text-text-tertiary regular:text-sm regular:leading-4.75 short-side-lg:text-lg short-side-lg:leading-6">
          <span aria-hidden="true">
            <span className="font-semibold">총</span> {formatElapsed(studySec)}
          </span>
          <span className="sr-only">총 공부 시간 {toKoreanDuration(studySec)}</span>
        </p>
      </div>
    </div>
  );
}
