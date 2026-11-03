import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { ReportMemberScreen } from "@/features/group-room/screens/ReportMemberScreen";
import { CTA_TOASTER_ID } from "@/lib/toast";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

import { GROUP_ROOM_ANALYTICS_MASK } from "../groupRoomAnalyticsMask";

/**
 * 공부방에서 멤버 신고하기 레이어
 *
 * 라우트를 바꾸면 세션이 내려가 카메라와 측정이 멈추므로 공부방 화면 위에 겹쳐 연다.
 * 뒤로 가기와 Esc는 이 레이어만 닫고 채널과 세션은 그대로 둔다.
 * 사유는 레이어가 들고 있다가 닫히면 비운다.
 * 사유 입력칸이 열리자마자 포커스를 가져가서 Radix가 연 요소를 기억하지 못하므로 닫을 때 돌아갈 곳은 호출부가 준다.
 */
export function ReportMemberLayer({
  open,
  nickname,
  container,
  pending,
  onSubmit,
  onClose,
  returnFocus,
}: {
  open: boolean;
  nickname: string;
  /** 포털 자리이고, 세션 화면 변수와 어두운 테마를 받으려면 세션 루트를 넘긴다. */
  container: HTMLElement | null;
  /** 보내는 중이면 신고하기 버튼을 막아 같은 신고가 두 번 나가지 않는다. */
  pending: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
  /** 닫힌 뒤 포커스를 받을 요소 */
  returnFocus?: () => HTMLElement | null;
}) {
  const { t } = useTranslation(["live-room", "common"]);
  const focusRestore = useDialogFocusRestore(returnFocus);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogPortal container={container ?? undefined}>
        <DialogPrimitive.Content
          // 앱이 웹 모달을 알아보는 단서가 이 속성이라 Radix가 달지 않아도 직접 단다.
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={focusRestore.onOpenAutoFocus}
          onCloseAutoFocus={focusRestore.onCloseAutoFocus}
          {...GROUP_ROOM_ANALYTICS_MASK}
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background"
        >
          <DialogTitle className="sr-only">{t("reportMemberLayer.title")}</DialogTitle>
          <ReportForm nickname={nickname} pending={pending} onSubmit={onSubmit} onBack={onClose} />
          {/* 레이어가 공부방의 토스트 자리를 덮어서 보내지 못한 안내는 레이어 위쪽에 띄운다.
              성공 안내는 레이어를 닫은 뒤 공부방 자리에 이어서 보여야 해서 닫힐 때 토스트를 지우지 않는다. */}
          <Toaster
            id={CTA_TOASTER_ID}
            position="top-center"
            className="absolute!"
            customAriaLabel={t("common:aria.ctaToaster")}
            toastOptions={{ classNames: { toast: "whitespace-nowrap" } }}
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/** 열릴 때마다 새로 그려서 닫았다 다시 열면 사유가 비어 있다. */
function ReportForm({
  nickname,
  pending,
  onSubmit,
  onBack,
}: {
  nickname: string;
  pending: boolean;
  onSubmit: (reason: string) => void;
  onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ReportMemberScreen
      nickname={nickname}
      value={reason}
      onChange={setReason}
      pending={pending}
      onSubmit={() => onSubmit(reason)}
      onBack={onBack}
    />
  );
}
