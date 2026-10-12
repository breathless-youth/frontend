import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RecordsView = "daily" | "weekly";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

const triggerClass =
  "relative mb-0 min-h-0 border-b-0 before:absolute before:-inset-x-0 before:-top-[7px] before:-bottom-[7px] before:content-[''] " +
  "rounded-[9px] px-4 py-[7px] text-[13px] leading-4 font-normal text-muted-foreground " +
  "transition-colors duration-200 motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] " +
  // 누를 수 없는 옵션은 흐리게 보여 준다(기기 미등록의 주간 탭).
  "disabled:pointer-events-none disabled:opacity-40 " +
  "data-[state=active]:bg-muted data-[state=active]:font-bold data-[state=active]:text-foreground " +
  "data-[state=active]:shadow-[var(--shadow-segment-thumb)]";

/**
 * 알약 모양 세그먼트
 *
 * 공용 Tabs는 밑줄형이 기본이라, 알약 모양에 필요한 값(높이·밑줄·글자)을 여기서 덮어쓴다.
 * 기록 탭의 일간·주간과 랭킹의 기간 고르기가 같이 쓴다.
 * 쓰는 곳 모두 탭 패널이 없어, Radix가 붙이는 `aria-controls`가 없는 요소를 가리키지 않게 뺀다.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  triggerClassName?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList
        aria-label={ariaLabel}
        className="inline-flex items-center gap-0.5 rounded-[12px] border-b-0 bg-bg-control-track p-1"
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
