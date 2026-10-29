import { Button } from "@/components/ui/button";
import { SUBJECT_SHEET_COPY } from "@/features/study-session/sessionCopy";

/**
 * 과목 순서 변경·편집 상태의 머리 줄
 *
 * 제목은 앱 상단 줄 제목과 같은 글자 모양이고 자리는 홈 날짜 제목 자리 그대로다.
 * `완료`는 세션 과목 페이지의 순서 변경 `완료`와 같은 버튼이고 글자만 브랜드색이다.
 */
export function HomeModeHeader({ title, onDone }: { title: string; onDone: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 pb-1">
      <h1 className="pt-1 text-[17px] leading-7.5 font-semibold text-foreground">{title}</h1>
      <Button
        variant="secondary"
        onClick={onDone}
        className="h-11 rounded-md px-3.5 text-[14px] font-semibold text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        {SUBJECT_SHEET_COPY.done}
      </Button>
    </header>
  );
}
