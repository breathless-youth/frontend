import type { PlannerTaskScope } from "@focusmakers/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { plannerErrorCopy } from "./plannerErrorCopy";
export interface PlannerRepeatScopeDialogProps {
  theme?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "rename" | "delete";
  onConfirm: (scope: PlannerTaskScope) => Promise<void>;
}
export function PlannerRepeatScopeDialog({
  open,
  onOpenChange,
  action,
  onConfirm,
  theme = "theme-soft-blue",
}: PlannerRepeatScopeDialogProps) {
  const { t } = useTranslation(["planner", "common"]);
  const [scope, setScope] = useState<PlannerTaskScope>("THIS");
  const [pending, setPending] = useState(false),
    [failure, setFailure] = useState<unknown>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          theme,
          "-mt-3 max-w-80 gap-0 rounded-3xl border-0 bg-muted px-5.5 pt-6.5 pb-5.5 shadow-[0_20px_25px_var(--dim)] sm:rounded-3xl",
        )}
      >
        <DialogTitle className="text-lg leading-6 font-bold tracking-normal">
          {t(action === "delete" ? "repeat.deleteTitle" : "repeat.renameTitle")}
        </DialogTitle>
        <fieldset className="mt-2 flex flex-col">
          <legend className="sr-only">{t("repeat.scope")}</legend>
          {(["THIS", "FUTURE"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-2.5 text-[15px] font-semibold"
            >
              <input
                type="radio"
                name="planner-repeat-scope"
                value={value}
                checked={scope === value}
                disabled={pending}
                onChange={() => setScope(value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-full border-2 border-border-strong peer-checked:border-6 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:opacity-50"
              />
              {t(value === "THIS" ? "repeat.this" : "repeat.future")}
            </label>
          ))}
        </fieldset>
        {failure !== null && (
          <p role="alert" className="text-sm text-state-distract-text">
            {plannerErrorCopy(failure)}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            disabled={pending}
            className="h-13 flex-1 rounded-lg text-[15px] font-semibold"
            onClick={() => onOpenChange(false)}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            disabled={pending}
            variant={action === "delete" ? "unstyled" : "default"}
            className={cn(
              "h-13 flex-1 rounded-lg text-[15px] font-semibold",
              action === "delete" && "bg-feedback-danger text-primary-foreground hover:opacity-90",
            )}
            onClick={() => {
              if (pending) return;
              setPending(true);
              setFailure(null);
              void onConfirm(scope)
                .then(
                  () => onOpenChange(false),
                  (error: unknown) => setFailure(error ?? new Error("planner save failed")),
                )
                .finally(() => setPending(false));
            }}
          >
            {t(action === "delete" ? "rowMenu.remove" : "plan.change")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
