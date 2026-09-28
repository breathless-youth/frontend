import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 장식 구분선 — shadcn Separator의 최소판(라딕스 없이 `div`). 정보가 아니라 시각 구분이라
 * `aria-hidden`이다. 세로 방향은 필요할 때 추가한다.
 */
export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="separator"
      aria-hidden="true"
      className={cn("h-px w-full bg-border", className)}
      {...props}
    />
  );
}
