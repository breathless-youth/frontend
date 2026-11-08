import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { GoalDurationInput } from "@/features/planner/GoalDurationInput";
import { clampGoalSeconds } from "@/features/planner/goalDuration";

export interface HomeGoalSaveInput {
  seconds: number;
  asDefault: boolean;
  defaultOnly: boolean;
}
export interface HomeGoalSaveResult {
  defaultSaved: boolean;
}

export function HomeGoalSheet({
  open,
  onOpenChange,
  initialSeconds,
  dateLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSeconds: number | null;
  dateLabel?: string;
  onSave: (input: HomeGoalSaveInput) => Promise<HomeGoalSaveResult>;
}) {
  const { t } = useTranslation(["home", "planner"]);
  const [seconds, setSeconds] = useState(() => clampGoalSeconds(initialSeconds ?? 28800));
  const [asDefault, setAsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"date" | "default" | null>(null);
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const defaultOnly = error === "default";
    try {
      const result = await onSave({ seconds, asDefault, defaultOnly });
      if (result.defaultSaved) onOpenChange(false);
      else setError("default");
    } catch {
      setError(defaultOnly ? "default" : "date");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const locked = saving || error === "default";
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!savingRef.current) onOpenChange(next);
      }}
    >
      <DrawerContent className="theme-soft-blue" variant="goal">
        <div className="flex flex-col gap-5 pt-4.75" data-base-ui-swipe-ignore>
          <div className="flex items-center justify-between gap-3">
            <DrawerTitle className="text-[22px] leading-7.5 font-bold">
              {t("planner:goal.title")}
            </DrawerTitle>
            <span className="text-sm leading-5 font-medium text-muted-foreground">{dateLabel}</span>
          </div>
          <DrawerDescription className="sr-only">{t("v3.goal.description")}</DrawerDescription>
          <GoalDurationInput
            seconds={seconds}
            disabled={locked}
            onChange={(next) => {
              setSeconds(next);
              setError(null);
            }}
          />
          <label className="flex min-h-11 items-center justify-between gap-3 text-base leading-6 font-medium">
            <span>{t("planner:goal.asDefault")}</span>
            <Switch
              size="settings"
              className="h-8 w-13 border-[3px] [&>span]:size-6.5"
              checked={asDefault}
              onCheckedChange={setAsDefault}
              disabled={locked}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-feedback-danger">
              {t(error === "default" ? "v3.goal.defaultFailed" : "v3.goal.saveFailed")}
            </p>
          )}
          <Button
            className="min-h-14 rounded-xl text-base leading-6 font-bold shadow-sb-cta"
            disabled={saving}
            onClick={() => void save()}
          >
            {t(
              saving
                ? "v3.goal.saving"
                : error === "default"
                  ? "v3.goal.retryDefault"
                  : "v3.goal.save",
            )}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
