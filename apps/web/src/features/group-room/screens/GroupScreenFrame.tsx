import type { ReactNode } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";

/**
 * 그룹 하위 화면의 바탕과 뒤로 가기 줄
 *
 * 화면 데이터를 받기 전이나 받지 못했을 때도 같은 바탕과 머리 줄 아래에 자리표시나 오류를 두어, 데이터가 오면 내용만 바뀐 것처럼 보이게 한다.
 * 목록 화면들도 이 틀을 써서 받는 중의 틀과 다 받은 화면의 여백이 어긋나지 않는다.
 */
export function GroupScreenFrame({
  title,
  onBack,
  children,
}: {
  /** 그룹 이름처럼 받아야 아는 제목은 받기 전에 비워 둔다. */
  title?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title={title} onBack={onBack} />
      <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {children}
      </div>
    </main>
  );
}
