import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[var(--dim)] duration-300 ease-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants ship alongside the component
export const sheetVariants = cva(
  // 퇴장은 트랜지션이 아니라 키프레임이어야 한다. Radix 는 닫을 때 CSS 애니메이션이 걸려
  // 있으면 animationend 를 기다렸다 요소를 걷어내지만, 트랜지션은 기다리지 않고 바로
  // 언마운트해 나가는 모습이 한 프레임도 보이지 않는다.
  "fixed z-50 bg-background p-6 text-foreground shadow-lg duration-300 ease-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-border data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
        bottom:
          "inset-x-0 bottom-0 border-t border-border data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r border-border sm:max-w-sm data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-border sm:max-w-sm data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * 포털이 그려질 자리. 기본은 `document.body` 다.
   *
   * 세션 화면처럼 CSS 변수를 서브트리에만 주입하는 곳에서는 반드시 그 서브트리의 요소를
   * 넘겨야 한다. body 로 나가면 변수가 풀리지 않아 색이 통째로 빠진다
   * (같은 문제를 `ui/toast.tsx` 가 폴백 값으로 우회한다).
   */
  container?: HTMLElement | null;
  /** 딤에 얹을 클래스. 세션처럼 전역 `--dim` 과 다른 딤을 쓰는 곳이 덮어쓴다. */
  overlayClassName?: string;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", container, className, overlayClassName, children, ...props }, ref) => (
  <SheetPortal container={container ?? undefined}>
    <SheetOverlay className={overlayClassName} />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      // Radix 가 이 속성을 만들어 주지 않는다 — `nativeModalOverlay.ts` 의 네이티브 탭 바
      // 차단 감지가 `aria-modal="true"` 의 존재 여부만 본다. props 보다 앞에 둬 호출부가
      // 필요하면 덮어쓸 수 있게 한다. 공용 `ui/dialog.tsx` 도 같은 이유로 달고 있다.
      aria-modal="true"
      {...props}
    >
      {children}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
