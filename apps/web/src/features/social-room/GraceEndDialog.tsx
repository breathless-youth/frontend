import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 자리를 오래 비워 공부가 끝났다는 안내 창
 *
 * 안내의 첫 줄을 제목으로, 나머지 줄을 설명으로 보인다.
 * `message`가 null이면 닫힌다.
 */
export function GraceEndDialog({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("social-room");
  const [title, ...bodyLines] = (message ?? "").split("\n");
  const body = bodyLines.join("\n");
  return (
    <Dialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="theme-soft-blue w-[calc(100%-2rem)] max-w-90 rounded-lg bg-muted"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body.length > 0 ? (
            <DialogDescription className="whitespace-pre-line">{body}</DialogDescription>
          ) : null}
        </DialogHeader>
        <Button variant="default" size="lg" className="w-full" onClick={onClose}>
          {t("home.noticeConfirm")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
