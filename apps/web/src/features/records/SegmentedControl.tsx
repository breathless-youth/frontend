import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type RecordsView = "daily" | "weekly";

/**
 * 일간·주간 세그먼트
 * 공용 Tabs는 밑줄형이 기본이라, 알약 모양에 필요한 값(높이·밑줄·글자)을 여기서 덮어쓴다.
 */
const triggerClass =
  "relative mb-0 min-h-0 border-b-0 before:absolute before:-inset-x-0 before:-top-[7px] before:-bottom-[7px] before:content-[''] " +
  "rounded-[9px] px-4 py-[7px] text-[13px] leading-4 font-normal text-muted-foreground " +
  "transition-colors duration-200 motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] " +
  // 누를 수 없는 탭은 흐리게 보여 준다(기기 미등록의 주간 탭).
  "disabled:pointer-events-none disabled:opacity-40 " +
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
    <Tabs value={value} onValueChange={(next) => onChange(next as RecordsView)}>
      <TabsList className="inline-flex items-center gap-0.5 rounded-[12px] border-b-0 bg-bg-control-track p-1">
        <TabsTrigger value="daily" className={triggerClass}>
          일간
        </TabsTrigger>
        <TabsTrigger value="weekly" disabled={weeklyDisabled} className={triggerClass}>
          주간
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
