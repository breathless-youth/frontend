import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn 스타일 카드 — 2026-09-14(BY-560) 사용자 요청으로 결과 화면의 `ResultCard`를 프리미티브로
 * 승격했다. 셸은 `bg/layer-1` + `border/default` + `radius.lg`(16).
 *
 * shadcn 원본과 다른 두 곳: 세로 패딩이 없다(카드마다 Figma 실측이 달라 호출부가 준다), 타이틀이
 * `div`가 아니라 `h2`다(화면 타이틀이 `h1`이라 카드 제목은 그 아래 단계). 라딕스 의존 없음.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-2xl border border-border bg-muted", className)}
      {...props}
    />
  );
}

/** 타이틀(왼쪽) + 보조 슬롯(오른쪽) 한 줄. */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center justify-between gap-3 px-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="card-title"
      className={cn("text-[14px] leading-[17px] font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />;
}
