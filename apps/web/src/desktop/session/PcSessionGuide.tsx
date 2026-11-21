import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

import { guideCardPosition, spotOf, type GuideRect } from "./guidePlacement";

// 비추는 구멍이 대상 테두리에 붙지 않게 둘레를 넓힌다.
const SPOT_PADDING = 8;

/**
 * PC 공부 가이드
 *
 * 상자 안에 덮개를 깔고 패널·카메라 창·버튼 줄의 지금 자리를 재서 구멍을 뚫는다.
 * 창 크기가 바뀌면 패널과 카메라 창이 안쪽으로 당겨져서 그때마다 다시 잰다.
 * 덮개 밖을 눌러도 닫지 않고, 나중에 하기·끝까지 보기·Esc로만 닫는다.
 * 열면 다음 버튼에 포커스를 두고, 닫으면 연 자리로 돌려준다.
 * 보는 동안 세션이 멈춰 있어서 마지막 버튼은 시작이 아니라 계속하기다.
 */
export function PcSessionGuide({
  box,
  onClose,
  returnFocus,
}: {
  box: HTMLElement;
  onClose: () => void;
  /** 연 자리가 사라졌거나 처음부터 포커스가 없었을 때 대신 받을 요소 */
  returnFocus: () => HTMLElement | null;
}) {
  const { t } = useTranslation(["desktop", "study-session"]);
  const steps = [
    { target: null, title: t("session.guide.welcomeTitle"), body: t("session.guide.welcomeBody") },
    { target: "stats", title: t("session.guide.focusTitle"), body: t("session.guide.focusBody") },
    {
      target: "camera",
      title: t("session.guide.cameraTitle"),
      body: t("session.guide.cameraBody"),
    },
    {
      target: "controls",
      title: t("session.guide.readyTitle"),
      body: t("session.guide.readyBody"),
    },
  ];
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<GuideRect | null>(null);
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const nextRef = useRef<HTMLButtonElement>(null);
  const focusRestore = useDialogFocusRestore(returnFocus);
  const current = steps[step];
  const last = step === steps.length - 1;
  const target = current.target;

  useLayoutEffect(() => {
    const measure = () => {
      setSpot(spotOf(box, target));
      const { width, height } = box.getBoundingClientRect();
      setBoxSize({ width, height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [box, target]);

  const position = guideCardPosition(spot, boxSize);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        container={box}
        showCloseButton={false}
        overlayClassName="bg-transparent"
        onOpenAutoFocus={(event) => {
          focusRestore.onOpenAutoFocus();
          event.preventDefault();
          nextRef.current?.focus();
        }}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        onInteractOutside={(event) => event.preventDefault()}
        className="absolute inset-0 top-0 left-0 block max-w-none translate-x-0 translate-y-0 border-0 bg-transparent p-0 shadow-none sm:rounded-none"
      >
        {spot === null ? (
          <div aria-hidden="true" className="absolute inset-0 bg-(--coach-dim)" />
        ) : (
          <div
            aria-hidden="true"
            style={{
              left: spot.left - SPOT_PADDING,
              top: spot.top - SPOT_PADDING,
              width: spot.width + SPOT_PADDING * 2,
              height: spot.height + SPOT_PADDING * 2,
            }}
            className="pointer-events-none absolute rounded-xl shadow-[0_0_0_9999px_var(--coach-dim)]"
          />
        )}
        <div
          style={position ?? undefined}
          className={cn(
            "absolute flex w-80 flex-col gap-2 rounded-xl bg-muted p-5 text-foreground shadow-sb-card",
            position === null && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          )}
        >
          <p className="text-xs leading-4 font-semibold text-primary tabular-nums">
            {t("study-session:help.stepCount", { current: step + 1, total: steps.length })}
          </p>
          <DialogTitle className="text-[17px] leading-6 font-bold text-foreground">
            {current.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-5 text-muted-foreground">
            {current.body}
          </DialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            {!last && (
              <Button variant="ghost" className="min-h-11 px-4" onClick={onClose}>
                {t("study-session:help.finishLater")}
              </Button>
            )}
            <Button
              ref={nextRef}
              className="min-h-11 px-4"
              onClick={() => (last ? onClose() : setStep(step + 1))}
            >
              {t(last ? "session.guide.continue" : "study-session:help.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
