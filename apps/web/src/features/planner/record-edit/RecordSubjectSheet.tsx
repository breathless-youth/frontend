import { useTranslation } from "react-i18next";
import type { SubjectResponse } from "@focusmakers/types";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { subjectColorVar } from "@/features/records/recordsTimetable";
export function RecordSubjectSheet({
  open,
  onOpenChange,
  subjects,
  summary,
  subjectScopeUnknown = false,
  errorMessage,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: readonly SubjectResponse[] | undefined;
  summary?: string;
  subjectScopeUnknown?: boolean;
  errorMessage?: string;
  onPick: (subjectId: number | null) => void;
}) {
  const { t } = useTranslation("planner");
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="theme-soft-blue"
        variant="planner"
        bottomSpacing="compact"
        initialFocus={false}
        finalFocus={false}
      >
        <div className="pt-3.5">
          <DrawerTitle className="text-lg leading-6.5 font-bold">
            {t("record.chooseSubject")}
          </DrawerTitle>
          {(summary || subjectScopeUnknown) && (
            <DrawerDescription className="mt-0.5 text-[13px] leading-5 text-muted-foreground tabular-nums">
              {summary}
              {subjectScopeUnknown && (
                <span className="block">{t("record.subjectScopeWarning")}</span>
              )}
            </DrawerDescription>
          )}
        </div>
        {errorMessage && (
          <p role="alert" className="mt-3 text-sm text-state-distract-text">
            {errorMessage}
          </p>
        )}
        <div className="mt-3.5 grid grid-cols-5 gap-2">
          {subjects?.map((subject) => (
            <Button
              key={subject.id}
              data-base-ui-swipe-ignore=""
              variant="unstyled"
              className="h-auto min-h-16 flex-col gap-1.5 rounded-lg border-[1.5px] border-border bg-muted px-1 py-2 text-xs leading-4 font-semibold whitespace-normal text-foreground"
              onClick={() => onPick(subject.id)}
            >
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-[6px] border-l-3"
                style={{
                  borderColor: subjectColorVar(subject.colorIndex),
                  background: `color-mix(in srgb, ${subjectColorVar(subject.colorIndex)} 30%, var(--muted))`,
                }}
              />
              <span className="text-xs wrap-break-word">{subject.name}</span>
            </Button>
          ))}
          <Button
            data-base-ui-swipe-ignore=""
            variant="unstyled"
            className="h-auto min-h-16 flex-col gap-1.5 rounded-lg border-[1.5px] border-border bg-muted px-1 py-2 text-xs leading-4 font-semibold whitespace-normal text-foreground"
            onClick={() => onPick(null)}
          >
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-[6px] border-l-3 border-primary bg-primary/30"
            />
            <span className="wrap-break-word">{t("subjects.unassigned")}</span>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
