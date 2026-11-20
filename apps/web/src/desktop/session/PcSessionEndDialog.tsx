import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * 공부가 끝난 뒤 상자 가운데 안내 창
 *
 * 결과 화면으로 가지 않는 끝맺음을 휴대폰 세션 화면과 같은 안내 부품으로 상자 안에 보여 준다.
 * 끝난 세션의 다음 동작을 고르는 창이라 Esc와 바깥 누름으로 닫지 않는다.
 * 안내 부품이 제목을 그리므로 창 이름은 화면 읽기에만 둔다.
 */
export function PcSessionEndDialog({
  container,
  title,
  children,
}: {
  container: HTMLElement;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open>
      <DialogContent
        role="alertdialog"
        container={container}
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex w-100 max-w-[calc(100%-2rem)] flex-col gap-0 rounded-xl border-0 bg-background p-6 sm:rounded-xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
