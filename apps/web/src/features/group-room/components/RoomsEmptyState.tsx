import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { DeskFigure } from "./DeskFigure";

/**
 * 그룹 목록이 비었을 때의 빈자리 그림과 안내
 *
 * 내 그룹과 공개 그룹 탭이 같은 그림과 글자 크기를 써서 한 부품으로 두고, 탭마다 다른 아래 버튼은 `children`으로 받는다.
 */
export function RoomsEmptyState({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <DeskFigure tone="empty" size="lg" />
      <p className="mt-4 text-lg leading-6.5 font-bold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm leading-5 break-keep text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
