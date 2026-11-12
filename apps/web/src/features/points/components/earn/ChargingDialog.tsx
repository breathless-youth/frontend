import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * 결제 뒤 포인트가 들어오기를 기다리는 창
 *
 * 스토어 결제가 끝나고 서버가 포인트를 넣을 때까지 뜬다.
 * 기다림이 끝나면 완료 창이나 실패 창이 이어지므로 사용자가 닫을 수 없다.
 */
export function ChargingDialog({ open }: { open: boolean }) {
  const { t } = useTranslation("points-earn");
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="theme-soft-blue w-[calc(100%-64px)] max-w-[320px] items-center gap-4 rounded-xl border-0 bg-muted px-5 py-7 text-center sm:rounded-xl"
      >
        <LoaderCircle
          aria-hidden
          className="mx-auto size-8 animate-spin text-primary motion-reduce:animate-none"
        />
        <DialogTitle role="status" className="text-[17px] font-bold break-keep">
          {t("charging.title")}
        </DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
