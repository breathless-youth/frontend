import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
export interface RecordDeleteRect {
  left: number;
  top: number;
  width: number;
  height: number;
  background: string;
  color: string;
  borderLeft: string;
  label: string | null;
  manual: boolean;
  rowLeft: number;
  rowWidth: number;
}
export interface RecordDeleteHandleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function RecordDeletePopover({
  open,
  onOpenChange,
  rects,
  handles = [],
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rects: readonly RecordDeleteRect[];
  handles?: readonly RecordDeleteHandleRect[];
  onConfirm: () => void;
}) {
  const { t } = useTranslation(["planner", "common", "records"]);
  const width = Math.min(250, window.innerWidth - 32),
    height = 104;
  const visible = rects.filter(
    (rect) => rect.top + rect.height > 0 && rect.top < window.innerHeight,
  );
  const top = visible.length ? Math.min(...visible.map((rect) => rect.top)) : 200;
  const bottom = visible.length ? Math.max(...visible.map((rect) => rect.top + rect.height)) : 200;
  const center = visible[0] ? visible[0].left + visible[0].width / 2 : window.innerWidth / 2;
  const left = Math.max(16, Math.min(window.innerWidth - width - 16, center - width / 2));
  const popupTop = Math.max(
    16,
    Math.min(
      window.innerHeight - height - 16,
      top >= height + 24 ? top - height - 10 : bottom + 10,
    ),
  );
  const above = popupTop < top;
  const arrowLeft = Math.max(16, Math.min(width - 30, center - left - 7));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        aria-describedby={undefined}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}
        className="theme-soft-blue fixed inset-0 top-0 left-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 border-0 bg-transparent p-0 shadow-none data-[state=open]:animate-none sm:rounded-none"
      >
        {rects.map((rect, index) => (
          <div
            key={index}
            aria-hidden
            inert
            className="pointer-events-none absolute overflow-hidden border-b border-border"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              background: rect.background,
              color: rect.color,
              boxShadow: "inset 0 2px 0 var(--primary), inset 0 -2px 0 var(--primary)",
            }}
          >
            <span className="absolute inset-0" style={{ borderLeft: rect.borderLeft }} />
            {Array.from({ length: 6 }, (_, slot) => {
              // 원래 한 시간 줄의 원점·폭을 유지한다. 부분 구간 자체를 6등분하지 않는다.
              const lineLeft = rect.rowLeft + (rect.rowWidth * (slot + 1)) / 6 - rect.left - 1;
              return lineLeft >= 0 && lineLeft < rect.width ? (
                <span
                  key={slot}
                  data-record-grid-line=""
                  className="absolute inset-y-0 border-l border-border"
                  style={{ left: lineLeft }}
                />
              ) : null;
            })}
            {rect.label && (
              <span className="absolute inset-0 flex items-center justify-center gap-1 overflow-hidden px-1 text-xs font-bold whitespace-nowrap">
                {rect.manual && (
                  <Pencil
                    role="img"
                    aria-label={t("records:manualItem.badge")}
                    size={11}
                    className="shrink-0"
                  />
                )}
                <span className="truncate">{rect.label}</span>
              </span>
            )}
          </div>
        ))}
        {handles.map((handle, index) => (
          <span
            key={index}
            aria-hidden
            inert
            data-record-delete-handle=""
            className="pointer-events-none absolute rounded-full border-[2.5px] border-primary bg-background shadow-[0_2px_6px_rgba(31,42,61,0.2)]"
            style={handle}
          />
        ))}
        <div
          className="absolute rounded-[18px] bg-muted p-4 shadow-[0_12px_28px_rgba(0,0,0,0.3)]"
          style={{ left, top: popupTop, width }}
        >
          <DialogTitle className="text-[15px] leading-5 font-bold tracking-normal">
            {t("record.deleteTitle")}
          </DialogTitle>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              className="relative h-10 flex-1 rounded-md text-sm leading-5 font-semibold before:absolute before:inset-x-0 before:-inset-y-0.5"
              onClick={() => onOpenChange(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="unstyled"
              className="relative h-10 flex-1 rounded-md bg-feedback-danger text-sm leading-5 font-semibold text-white before:absolute before:inset-x-0 before:-inset-y-0.5"
              onClick={onConfirm}
            >
              {t("rowMenu.remove")}
            </Button>
          </div>
          <span
            aria-hidden
            className="absolute size-3.5 rotate-45 rounded-br-[3px] bg-muted"
            style={{ left: arrowLeft, ...(above ? { bottom: -7 } : { top: -7 }) }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
