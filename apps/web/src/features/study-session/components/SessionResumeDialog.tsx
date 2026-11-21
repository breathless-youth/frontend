import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  trackStudySessionResumeAnswered,
  trackStudySessionResumePrompted,
  type ResumePromptPlace,
} from "@/lib/amplitude";

/**
 * 꺼진 자율 모드 공부를 이어 갈지 묻는 창
 *
 * 고르기 전에는 기록이 정해지지 않아 바깥 누르기와 ESC로 닫지 않는다.
 * 고른 뒤에는 요청이 끝날 때까지 두 버튼을 막아 두 요청이 겹치지 않게 한다.
 * 창은 부르는 쪽이 요청을 마친 뒤에 닫는다.
 * 요청이 실패하면 다시 고를 수 있게 두 버튼을 연다.
 * PC 홈은 세션이 홈 상자 안에서 열려서 창도 그 상자 안에 띄운다.
 */
export function SessionResumeDialog({
  awayMin,
  place,
  onResume,
  onEnd,
  container,
}: {
  awayMin: number;
  place: ResumePromptPlace;
  onResume: () => void | Promise<void>;
  onEnd: () => void | Promise<void>;
  container?: HTMLElement;
}) {
  const { t } = useTranslation("study-session");
  const [busy, setBusy] = useState(false);
  // StrictMode가 effect를 두 번 돌려도 노출은 한 번만 남긴다.
  const promptedRef = useRef(false);

  useEffect(() => {
    if (promptedRef.current) {
      return;
    }
    promptedRef.current = true;
    trackStudySessionResumePrompted({ awayMin, place });
  }, [awayMin, place]);

  const answer = (choice: "resume" | "end") => {
    setBusy(true);
    trackStudySessionResumeAnswered({ choice, place });
    void Promise.resolve()
      .then(choice === "resume" ? onResume : onEnd)
      .catch(() => setBusy(false));
  };

  return (
    <Dialog open>
      <DialogContent
        role="dialog"
        container={container}
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="flex w-[calc(100%-2.5rem)] max-w-[320px] flex-col items-center gap-4 rounded-3xl border-0 bg-background px-5.5 pt-7 pb-5.5"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="size-7.5" strokeWidth={2.53} aria-hidden="true" />
        </div>
        <DialogTitle className="text-center text-[19px] leading-5.75 font-extrabold text-foreground">
          {t("resume.title")}
        </DialogTitle>
        <DialogDescription className="text-center text-[14px] leading-[1.45] font-medium text-muted-foreground">
          {t("resume.body", { minutes: awayMin })}
        </DialogDescription>
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => answer("resume")}
            className="h-13 w-full shrink-0 rounded-[14px] text-[16px] font-semibold motion-reduce:transition-none"
          >
            {t("resume.continue")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => answer("end")}
            className="h-12 w-full shrink-0 rounded-[14px] text-[15px] font-medium text-muted-foreground motion-reduce:transition-none"
          >
            {t("resume.end")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
