import { cn } from "@/lib/utils";

type ModeCardKind = "focus" | "break";

const KIND_LABEL: Record<ModeCardKind, string> = { focus: "집중", break: "휴식" };

const DOT_CLASS: Record<ModeCardKind, string> = {
  focus: "bg-(--session-mode-focus)",
  break: "bg-(--session-mode-break)",
};

// 테두리 대신 안쪽 링을 써서 선택이 바뀌어도 카드 크기가 그대로다.
const SELECTED_CLASS: Record<ModeCardKind, string> = {
  focus: "bg-brand-subtle inset-ring-[1.5px] inset-ring-primary",
  break: "bg-(--session-mode-break)/12 inset-ring-2 inset-ring-(--session-mode-break)",
};

/**
 * 뽀모도로 집중·휴식 칸
 *
 * 누르면 그 칸이 선택되고 분 키패드가 열린다.
 */
export function ModeCard({
  kind,
  minutes,
  selected,
  onPress,
}: {
  kind: ModeCardKind;
  minutes: number;
  selected: boolean;
  onPress: () => void;
}) {
  const label = KIND_LABEL[kind];

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${label} ${minutes}분`}
      aria-current={selected ? "true" : undefined}
      onClick={onPress}
      className={cn(
        "flex min-h-17 flex-1 flex-col items-start gap-1 rounded-[14px] px-3.5 py-3 text-left transition-[scale] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        selected ? SELECTED_CLASS[kind] : "bg-muted",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] leading-4 font-medium text-muted-foreground">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT_CLASS[kind])} />
        {label}
      </span>
      <span className="flex items-baseline gap-0.75">
        <span className="text-[22px] leading-7 font-bold text-foreground tabular-nums">
          {minutes}
        </span>
        <span className="text-[13px] leading-4 font-medium text-muted-foreground">분</span>
      </span>
    </button>
  );
}
