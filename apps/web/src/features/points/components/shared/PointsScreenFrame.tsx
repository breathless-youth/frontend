import type { ReactNode } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { cn } from "@/lib/utils";

import { PointsBalancePill } from "./PointsBalancePill";

/**
 * 포인트 하위 화면의 바탕과 뒤로 가기 줄
 *
 * 어느 화면에서든 산 뒤의 잔액이 보이도록 오른쪽 위에 잔액 알약을 둔다.
 * 받기 전이나 받지 못했을 때도 같은 틀 아래에 자리표시나 오류를 두어 데이터가 오면 내용만 바뀐다.
 * 결제·환불 안내처럼 잔액과 상관없는 화면은 `balance`에 null을 넘겨 알약을 그리지 않는다.
 * `fitScreen`을 주면 틀을 화면 높이에 맞추고 아래 여백을 두지 않아, 안쪽 목록만 스크롤하고 아래 버튼과 안전 영역은 화면이 맡는다.
 * 높이가 낮은 가로 화면에서는 안쪽 목록 자리가 없어져 지금처럼 화면 전체가 스크롤된다.
 */
export function PointsScreenFrame({
  title,
  onBack,
  balance,
  fitScreen = false,
  children,
}: {
  title?: string;
  onBack: () => void;
  balance: number | undefined | null;
  fitScreen?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground",
        fitScreen && "not-landscape-compact:h-dvh not-landscape-compact:overflow-hidden",
      )}
    >
      <ScreenBackHeader
        title={title}
        onBack={onBack}
        trailing={
          balance === null ? undefined : <PointsBalancePill size="screen" balance={balance} />
        }
      />
      <div
        className={cn(
          "flex flex-1 flex-col px-5",
          fitScreen ? "min-h-0" : "pb-[calc(env(safe-area-inset-bottom)+24px)]",
        )}
      >
        {children}
      </div>
    </main>
  );
}
