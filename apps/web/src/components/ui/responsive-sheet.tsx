import { X } from "lucide-react";
import { useId, useRef, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { usePcShell } from "@/desktop/usePcShell";
import { cn } from "@/lib/utils";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer";

type DrawerRootProps = ComponentProps<typeof Drawer>;
type DrawerChangeDetails = Parameters<NonNullable<DrawerRootProps["onOpenChange"]>>[1];

export interface ResponsiveSheetProps {
  open: boolean;
  /** 서랍은 닫기를 무를 수 있는 세부값을 함께 넘기고, 가운데 창은 넘기지 않는다. */
  onOpenChange: (open: boolean, details?: DrawerChangeDetails) => void;
  /** 포털이 body로 나가 다시 달아야 하는 테마 클래스 */
  className?: string;
  /** 화면에 보이지 않게 읽어 줄 설명. 없으면 설명 연결을 끈다. */
  description?: string;
  /** 모바일 서랍에만 있는 설정 */
  drawer?: Pick<DrawerRootProps, "modal" | "disablePointerDismissal"> &
    Pick<ComponentProps<typeof DrawerContent>, "variant" | "finalFocus">;
  children: ReactNode;
}

/**
 * 창 폭에 따라 겉 틀을 고르는 시트
 *
 * PC 셸에서는 가운데 창으로, 그 밖에서는 바닥 서랍으로 같은 내용을 연다.
 * 가운데 창은 트리거 없이 열려 Radix가 포커스를 돌려주지 않아, 열 때 포커스가 있던 요소를 기억했다가 닫을 때 돌려준다.
 * 기본 닫기 버튼은 오른쪽 위에 떠서 머리줄 오른쪽 값을 덮으므로 끄고, 닫기는 `ResponsiveSheetHeader`가 머리줄 안에 둔다.
 * 서랍 부품을 함께 들고 있어 나눠 받는 시트 모듈에서만 import한다.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  className,
  description,
  drawer,
  children,
}: ResponsiveSheetProps) {
  const pc = usePcShell();
  const opener = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  if (pc) {
    return (
      <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={description === undefined ? undefined : descriptionId}
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className={cn("max-w-140 gap-0 border-0 bg-muted px-5 pt-2 pb-7", className)}
        >
          {description !== undefined && (
            <DialogDescription id={descriptionId} className="sr-only">
              {description}
            </DialogDescription>
          )}
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer
      open={open}
      modal={drawer?.modal}
      disablePointerDismissal={drawer?.disablePointerDismissal}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        className={className}
        variant={drawer?.variant}
        finalFocus={drawer?.finalFocus}
      >
        {description !== undefined && (
          <DrawerDescription className="sr-only">{description}</DrawerDescription>
        )}
        {children}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * 시트 머리줄
 *
 * 모바일 서랍은 끌어 닫아 받은 줄을 그대로 그린다.
 * PC 가운데 창은 받은 줄 옆에 닫기 버튼을 나란히 두어, 머리줄 오른쪽 값과 닫기가 겹치지 않는다.
 */
export function ResponsiveSheetHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const pc = usePcShell();
  const { t } = useTranslation("common");
  if (!pc) return <div className={className}>{children}</div>;
  return (
    <div className="flex items-center gap-2">
      <div className={cn("min-w-0 flex-1", className)}>{children}</div>
      <DialogClose
        aria-label={t("actions.close")}
        className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none"
      >
        <X aria-hidden="true" className="size-5" />
      </DialogClose>
    </div>
  );
}

/** 시트 제목. 고른 겉 틀의 제목 부품으로 그려 창의 이름이 된다. */
export function ResponsiveSheetTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const pc = usePcShell();
  return pc ? (
    <DialogTitle className={cn("tracking-normal", className)}>{children}</DialogTitle>
  ) : (
    <DrawerTitle className={className}>{children}</DrawerTitle>
  );
}
