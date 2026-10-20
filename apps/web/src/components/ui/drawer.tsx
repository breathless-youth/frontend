import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { COVERS_TAB_BAR_ATTR } from "@/lib/nativeModalOverlay";
import { cn } from "@/lib/utils";

/**
 * 바닥 시트
 *
 * shadcn Base 레지스트리의 Drawer(`@base-ui/react/drawer`)를 바닥 시트 하나로 줄였다.
 * 스냅 포인트·중첩 스택·방향 선택은 쓰는 곳이 없어 넣지 않았고, 끌어 닫는 방향은 Base UI 기본값인 아래다.
 * 이 파일은 나눠 받는 시트 모듈에서만 import한다. 다른 곳에서 값으로 가져오면 Base UI가 첫 번들에 들어간다.
 */
const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;
const DrawerTitle = DrawerPrimitive.Title;
const DrawerDescription = DrawerPrimitive.Description;

const DRAWER_EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

type DrawerContentProps = Omit<DrawerPrimitive.Popup.Props, "className"> & {
  /** 모양이 아닌 클래스만 넘긴다(포털이 body로 나가 다시 달아야 하는 테마 클래스 등). */
  className?: string;
};

/**
 * 시트 본체
 *
 * 바닥 시트의 둥글기·그림자·여백·손잡이·모션은 여기서만 정한다.
 * 끄는 동안 Base UI가 transform을 인라인으로 쓰고, 놓으면 `--drawer-swipe-movement-y`로 돌아온다.
 * 모션 축소는 움직임 대신 페이드만 남긴다. 전역 tw-animate 덮기(`index.css`)는 Base UI 전환에 닿지 않는다.
 */
function DrawerContent({ className, children, ...props }: DrawerContentProps) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-dim opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*300ms)] data-swiping:duration-0",
          DRAWER_EASE,
        )}
      />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
        <DrawerPrimitive.Popup
          // Base UI는 aria-modal을 달지 않는다. 탭 바 감지(`nativeModalOverlay.ts`)가 이 속성만 보고,
          // 바닥 시트는 떠 있는 탭 바 자리까지 덮으므로 딤 차단이 아니라 숨김을 받도록 표시한다.
          aria-modal="true"
          {...{ [COVERS_TAB_BAR_ATTR]: "" }}
          className={cn(
            // 태블릿에서는 본문 열과 같은 폭으로 가운데에 띄운다(`page-width`). 끌기가 transform을 쓰므로 가운데 정렬은 margin이 맡는다.
            "relative w-full page-width rounded-t-[24px] bg-muted px-5 pb-[max(28px,calc(env(safe-area-inset-bottom)+8px))] text-foreground shadow-[0_-12px_40px_rgba(0,0,0,0.18)] outline-none",
            // 위로 튕길 때 시트 아래가 비어 보이지 않게 같은 바탕을 화면 밖까지 잇는다.
            "after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-inherit",
            "[transform:translateY(var(--drawer-swipe-movement-y,0px))] duration-300 data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*300ms)]",
            "motion-safe:transition-transform motion-safe:data-starting-style:[transform:translateY(100%)] motion-safe:data-ending-style:[transform:translateY(100%)]",
            "motion-reduce:transition-opacity motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
            DRAWER_EASE,
            className,
          )}
          {...props}
        >
          {/* 판 어디를 끌어도 닫혀 손잡이는 표시일 뿐이다. 잡는 자리는 44px로 두되 음수 여백으로 내용은 막대 바로 아래에서 시작한다. */}
          <div
            aria-hidden="true"
            data-slot="drawer-handle"
            className="-mb-7 flex h-11 shrink-0 justify-center pt-3"
          >
            <div className="h-1 w-9 rounded-full bg-border-strong" />
          </div>
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger };
