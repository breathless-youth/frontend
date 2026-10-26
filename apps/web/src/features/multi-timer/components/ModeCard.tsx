import { cn } from "@/lib/utils";

type ModeCardKind = "focus" | "break";

const KIND_LABEL: Record<ModeCardKind, string> = { focus: "집중", break: "휴식" };

// 고른 칸은 테두리 없이 배경색으로만 가른다.
const SELECTED_CLASS: Record<ModeCardKind, string> = {
  focus: "bg-brand-subtle",
  break: "bg-(--session-mode-break)/12",
};

const MINUTE_STEP = 5;

/**
 * 선택 목록의 분 값
 *
 * 5분 단위로 고르게 한다.
 * 다이얼은 1분 단위라 지금 값이 단위에 맞지 않으면 그 값을 끼워 넣어 휠이 지금 값을 가리키게 한다.
 */
function minuteOptions(current: number, max: number): number[] {
  const steps = Array.from({ length: max / MINUTE_STEP }, (_, index) => (index + 1) * MINUTE_STEP);
  return steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
}

/**
 * 뽀모도로 집중·휴식 칸
 *
 * 칸 위에 보이지 않는 선택 목록을 덮어 누르면 OS의 분 선택 휠이 바로 열린다.
 * iOS 웹킷은 select의 showPicker를 지원하지 않아 사용자의 탭이 select에 직접 닿아야 한다.
 * 글자 크기가 16px보다 작으면 iOS가 포커스 때 화면을 확대해서 text-base를 둔다.
 * iOS는 select를 탭해도 키보드 포커스로 보고 링을 그려서, 포커스 링은 마우스를 쓰는 기기에서만 그린다.
 */
export function ModeCard({
  kind,
  minutes,
  max,
  selected,
  onSelect,
  onChangeMinutes,
}: {
  kind: ModeCardKind;
  minutes: number;
  max: number;
  selected: boolean;
  onSelect: () => void;
  onChangeMinutes: (minutes: number) => void;
}) {
  const label = KIND_LABEL[kind];

  return (
    <div
      className={cn(
        "relative grid min-h-13 flex-1 grid-cols-2 items-center rounded-[14px] px-3.5 py-3 transition-[scale] duration-150 ease-out pointer-fine:has-focus-visible:ring-2 pointer-fine:has-focus-visible:ring-(--state-focus) active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        selected ? SELECTED_CLASS[kind] : "bg-muted",
      )}
    >
      {/* 이름은 왼쪽 절반 가운데에서 반 글자만큼 왼쪽, 분은 오른쪽 절반 가운데에 둔다. */}
      <span
        aria-hidden="true"
        className="translate-x-[-0.5em] justify-self-center text-[15px] leading-5 font-medium text-muted-foreground"
      >
        {label}
      </span>
      <span aria-hidden="true" className="flex items-center gap-0.75 justify-self-center">
        <span className="text-[22px] leading-7 font-bold text-foreground tabular-nums">
          {minutes}
        </span>
        <span className="text-[15px] leading-5 font-medium text-muted-foreground">분</span>
      </span>
      <select
        aria-label={`${label} 시간`}
        aria-current={selected ? "true" : undefined}
        value={minutes}
        onFocus={onSelect}
        onChange={(event) => {
          onSelect();
          onChangeMinutes(Number(event.target.value));
        }}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-[14px] text-base opacity-0 outline-none"
      >
        {minuteOptions(minutes, max).map((value) => (
          <option key={value} value={value}>
            {value}분
          </option>
        ))}
      </select>
    </div>
  );
}
