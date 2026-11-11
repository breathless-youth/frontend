import type { ReactNode } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";

import { PointsBalancePill } from "./PointsBalancePill";

/**
 * 포인트 하위 화면의 바탕과 뒤로 가기 줄
 *
 * 어느 화면에서든 산 뒤의 잔액이 보이도록 오른쪽 위에 잔액 알약을 둔다.
 * 받기 전이나 받지 못했을 때도 같은 틀 아래에 자리표시나 오류를 두어 데이터가 오면 내용만 바뀐다.
 */
export function PointsScreenFrame({
  title,
  onBack,
  balance,
  children,
}: {
  title?: string;
  onBack: () => void;
  balance: number | undefined;
  children: ReactNode;
}) {
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader
        title={title}
        onBack={onBack}
        trailing={<PointsBalancePill size="screen" balance={balance} />}
      />
      <div className="flex flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {children}
      </div>
    </main>
  );
}
