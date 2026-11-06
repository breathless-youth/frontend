import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

export function PlannerNameSheet({
  open,
  onOpenChange,
  initial,
  label,
  title,
  maxLength,
  onSave,
  getErrorMessage,
  closeOnSave = true,
  theme = "theme-soft-blue",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  label: string;
  title: string;
  maxLength: number;
  onSave: (name: string) => Promise<void>;
  getErrorMessage?: (error: unknown) => string;
  closeOnSave?: boolean;
  theme?: string;
}) {
  const { t } = useTranslation(["planner", "common"]);
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const id = useId(),
    countId = useId();
  const over = name.length > maxLength;
  async function save() {
    if (pending || over || !name.trim()) return;
    setPending(true);
    setErrorMessage(null);
    try {
      await onSave(name.trim());
      if (closeOnSave) onOpenChange(false);
    } catch (error) {
      setErrorMessage(getErrorMessage?.(error) ?? t("common:errors.retryLater"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent variant="planner" className={theme} initialFocus={false} finalFocus={false}>
        <div className="flex flex-col gap-4.5 pt-4.5">
          <DrawerTitle className="text-lg leading-6.5 font-bold">{title}</DrawerTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            className="flex flex-col gap-4.5"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={id} className="sr-only">
                {label}
              </label>
              <Input
                id={id}
                data-base-ui-swipe-ignore=""
                autoFocus
                className="border-[1.5px] border-primary leading-5.5 focus-visible:ring-0"
                value={name}
                disabled={pending}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrorMessage(null);
                }}
                aria-invalid={over || undefined}
                aria-describedby={countId}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.nativeEvent.isComposing)
                    event.preventDefault();
                }}
              />
              <CharCount
                id={countId}
                length={name.length}
                max={maxLength}
                className="leading-4 text-muted-foreground"
                overMessage={t("editor.overLimit", { count: maxLength })}
              />
            </div>
            {errorMessage && (
              <p role="alert" className="text-sm text-state-distract-text">
                {errorMessage}
              </p>
            )}
            <Button
              data-base-ui-swipe-ignore=""
              type="submit"
              disabled={pending || over || !name.trim()}
              className="h-13 rounded-xl text-base leading-6 font-bold shadow-sb-cta"
            >
              {t("record.save")}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
