import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

export type RecordsView = "daily" | "weekly";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

const triggerClass =
  "relative mb-0 min-h-0 border-b-0 before:absolute before:inset-x-0 before:-top-1.75 before:-bottom-1.75 before:content-[''] " +
  "rounded-[9px] px-4 py-1.75 text-[13px] leading-4 font-normal text-muted-foreground " +
  "transition-colors duration-200 motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--state-focus) " +
  // 누를 수 없는 옵션은 흐리게 보여 준다(기기 미등록의 주간 탭).
  "disabled:pointer-events-none disabled:opacity-40 " +
  "data-[state=active]:bg-muted data-[state=active]:font-bold data-[state=active]:text-foreground " +
  "data-[state=active]:shadow-(--shadow-segment-thumb)";

/**
 * 알약 모양 세그먼트
 *
 * 공용 Tabs는 밑줄형이 기본이라, 알약 모양에 필요한 값(높이·밑줄·글자)을 여기서 덮어쓴다.
 * 기록 탭의 일간·주간, 랭킹의 종목·기간, 타이머 화면의 종류 고르기가 같이 쓴다.
 * 쓰는 곳 모두 탭 패널이 없어, Radix가 붙이는 `aria-controls`가 없는 요소를 가리키지 않게 뺀다.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  nativeControlId,
  className,
  triggerClassName,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /**
   * 앱 부품 id
   *
   * 옵션 값으로 만든 id가 앱이 받는 글자를 벗어날 때 대신 쓴다.
   * null이면 앱 부품으로 등록하지 않고 웹으로만 그린다.
   */
  nativeControlId?: string | null;
  /** 놓이는 곳마다 폭이 달라(기록 탭 머리는 줄을 채운다) 목록 상자에 덧붙인다. */
  className?: string;
  triggerClassName?: string;
}) {
  const { ref } = useNativeControl<HTMLDivElement>(
    nativeControlId === null
      ? null
      : {
          // 앱 id는 소문자만 받는데 랭킹 기간 값은 대문자다.
          id:
            nativeControlId ??
            `segment-${options.map((option) => option.value).join("-")}`.toLowerCase(),
          kind: "segment",
          labels: options.map((option) => option.label),
          selected: options.findIndex((option) => option.value === value),
          disabled: options.map((option) => option.disabled ?? false),
          accessibilityLabel: ariaLabel ?? null,
        },
    (index) => {
      const option = options[index];
      if (option !== undefined && !option.disabled) {
        onChange(option.value);
      }
    },
  );

  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-[12px] border-b-0 bg-bg-control-track p-1",
          className,
        )}
      >
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            aria-controls={undefined}
            disabled={option.disabled}
            className={cn(triggerClass, triggerClassName)}
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
