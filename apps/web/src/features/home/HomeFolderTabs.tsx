import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const TAB_CLASS = [
  "relative mb-px min-h-8 flex-auto shrink-0 justify-center border-b-0 px-4 not-first:-ml-2",
  "text-xs leading-4 tracking-tight text-muted-foreground focus-visible:ring-inset",
  "before:absolute before:inset-0 before:origin-bottom before:rounded-t-[10px]",
  "before:border before:border-b-0 before:border-border before:bg-bg-control-track",
  "before:transform-[perspective(32px)_rotateX(12deg)_scaleY(1.3)]",
  "data-[state=active]:z-10 data-[state=active]:mb-0 data-[state=active]:font-semibold",
  "data-[state=active]:text-foreground data-[state=active]:before:bg-muted",
].join(" ");

/**
 * 홈 헤더 아래 끝의 폴더식 탭
 *
 * 둥근 사각형을 아래 변 기준으로 뒤로 눕혀 위가 좁은 사다리꼴로 만든다.
 * 눕히면 낮아지는 만큼 세로로 늘려, 보이는 높이를 탭 상자 높이와 맞춘다. 그래야 가운데 둔 글자가 보이는 탭의 가운데에 온다.
 * 옆면이 비스듬해져 이웃 탭과 겹치면 서류철 칸막이처럼 보이고, 모서리 둥글기와 테두리는 그대로 남는다.
 * 탭이 늘어날 것에 대비해 줄은 가로로 넘긴다. 탭이 적어 남는 폭은 탭들이 나눠 채운다.
 * 가로로 넘기면 줄 밖으로 나간 부분이 잘려서, 기준선은 줄 테두리 대신 줄 안쪽 맨 아래 1px에 그린다.
 * 고르지 않은 탭은 기준선 위에 서고, 고른 탭만 기준선까지 내려와 덮어 아래 본문과 이어진다.
 */
export function HomeFolderTabs({ tabs }: { tabs: readonly { value: string; label: string }[] }) {
  return (
    <TabsList className="mt-3 gap-0 overflow-x-auto overflow-y-hidden border-b-0 shadow-[inset_0_-1px_0_var(--color-border)] scrollbar-none [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value} className={TAB_CLASS}>
          {/* 안쪽 면 위에 글자가 오도록 쌓임 순서를 만든다. */}
          <span className="relative">{tab.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
