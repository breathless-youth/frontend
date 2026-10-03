import * as TabsPrimitive from "@radix-ui/react-tabs";

export type RecordsView = "daily" | "weekly";

/**
 * 일간·주간 세그먼트
 * 공용 tabs.tsx는 밑줄형 베이스(min-h-11 등)라 알약 높이를 못 줄여,
 * Radix 프리미티브를 직접 써 시안 알약 크기를 낸다.
 */
const triggerClass =
  "relative before:absolute before:-inset-x-0 before:-top-[7px] before:-bottom-[7px] before:content-[''] " +
  "rounded-[9px] px-4 py-[7px] text-[13px] leading-4 font-normal text-muted-foreground " +
  "transition-colors duration-200 motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] " +
  "disabled:pointer-events-none " +
  "data-[state=active]:bg-muted data-[state=active]:font-bold data-[state=active]:text-foreground " +
  "data-[state=active]:shadow-[var(--shadow-segment-thumb)]";

export function SegmentedControl({
  value,
  onChange,
  weeklyDisabled = false,
}: {
  value: RecordsView;
  onChange: (value: RecordsView) => void;
  weeklyDisabled?: boolean;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(next) => onChange(next as RecordsView)}>
      <TabsPrimitive.List className="inline-flex items-center gap-0.5 rounded-[12px] bg-bg-control-track p-1">
        <TabsPrimitive.Trigger value="daily" className={triggerClass}>
          일간
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="weekly" disabled={weeklyDisabled} className={triggerClass}>
          주간
        </TabsPrimitive.Trigger>
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
