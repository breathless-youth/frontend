import {
  SubjectLabel,
  type SubjectLabelProps,
} from "@/features/study-session/components/SubjectLabel";
import { cn } from "@/lib/utils";

// 보이는 알약은 누르는 영역보다 작아서 배경을 위아래가 안으로 들어간 가상 요소에 그린다.
// isolate는 그 배경이 버튼 밖 부모 뒤로 내려가지 않게 막는다.
// 태블릿은 바가 커지는 비율만큼 알약도 키워야 바 옆에서 작아 보이지 않는다.
const PILL_CLASS =
  "relative isolate gap-1.5 pr-2.5 before:absolute before:inset-x-0 before:inset-y-1.5 before:-z-10 before:rounded-full before:bg-(--session-bar-glass-bg) before:shadow-[0px_10px_15px_var(--session-bar-glass-shadow),inset_0px_1px_0px_var(--session-bar-glass-highlight)] before:backdrop-blur-[11px] max-w-full regular:h-13 regular:gap-1.75 regular:px-3.5 regular:pr-3 regular:text-[15px] regular:leading-5 regular:before:inset-y-1.75 regular:[&>img]:size-1.75 regular:[&>svg]:size-4.25 short-side-lg:h-16.25 short-side-lg:gap-2.25 short-side-lg:px-4.5 short-side-lg:pr-3.75 short-side-lg:text-[19px] short-side-lg:leading-6.25 short-side-lg:before:inset-y-2.25 short-side-lg:[&>img]:size-2.25 short-side-lg:[&>svg]:size-5.25";

type RoomSubjectPillProps = Omit<SubjectLabelProps, "className"> & {
  /** 모달 메뉴가 열린 동안 바깥 누름이 알약에 먹히지 않고 메뉴를 닫게 한다. */
  inactive?: boolean;
};

/**
 * 소셜룸 선택 과목 알약
 *
 * 싱글룸 과목 줄과 같은 글자와 일시정지 모양에 바와 같은 유리 배경만 더한다.
 * 화면 탭이 조작 토글이라 알약 누름이 루트까지 올라가면 과목 페이지를 여는 탭이 조작도 함께 숨긴다.
 */
export function RoomSubjectPill({ inactive = false, ...label }: RoomSubjectPillProps) {
  return (
    // 감싼 칸이 줄 전체로 늘어나면 알약 옆 빈 자리의 화면 탭까지 끊기므로 알약 폭에 맞춘다.
    <div className="w-fit" onPointerDown={(event) => event.stopPropagation()}>
      <SubjectLabel {...label} className={cn(PILL_CLASS, inactive && "pointer-events-none")} />
    </div>
  );
}
