import { ChevronLeft } from "lucide-react";

import { REPORT_FIELD } from "./reportField";
import { WriteScreen } from "./WriteScreen";

/**
 * 공부방에서 멤버 신고하기
 *
 * 공부방에서 나가지 않고 그 위에 겹쳐 열리는 어두운 화면이고, 신고하면 그 멤버를 차단도 한다.
 */
export function ReportMemberScreen({
  nickname,
  value,
  onChange,
  pending,
  serverError,
  onSubmit,
  onBack,
}: {
  nickname: string;
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  /** 서버가 글을 받지 않은 이유이고, 글을 고치면 호출부가 비운다. */
  serverError?: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <WriteScreen
      tone="dark"
      header={<LayerHeader title="신고하기" onBack={onBack} />}
      headline={`${nickname}님을 신고할게요`}
      description={`신고하면 ${nickname}님의 화면을 볼 수 없어요`}
      {...REPORT_FIELD}
      value={value}
      onChange={onChange}
      pending={pending}
      serverError={serverError}
      onSubmit={onSubmit}
    />
  );
}

/**
 * 공부방 위 화면의 머리 줄
 *
 * 공부방은 앱의 유리 머리 줄 없이 그리는 화면이라 그 위에 겹친 화면도 머리 줄을 앱에 맡기지 않고 웹이 그린다.
 */
function LayerHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+4px)] pb-1">
      <button
        type="button"
        aria-label="뒤로 가기"
        onClick={onBack}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        <ChevronLeft aria-hidden="true" size={20} />
      </button>
      <h1 className="truncate text-[17px] leading-6 font-bold text-foreground">{title}</h1>
    </div>
  );
}
