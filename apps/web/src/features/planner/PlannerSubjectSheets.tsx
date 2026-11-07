import { Check, ChevronLeft, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SubjectResponse } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { CharCount, isCharCountVisible } from "@/components/ui/char-count";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatMonthDay } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { MAX_SUBJECTS, SUBJECT_NAME_MAX } from "@/features/study-session/subjectInteractions";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface PlannerSubjectSheetsProps {
  theme?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateKey: string;
  subjects: readonly SubjectResponse[] | undefined;
  includedSubjectIds: readonly number[];
  onAddSubjects: (dateKey: string, subjectIds: number[]) => Promise<void>;
  onCreateSubject: (name: string) => Promise<SubjectResponse>;
  loadError?: { retry: () => void };
}

export function PlannerSubjectSheets({
  open,
  onOpenChange,
  dateKey,
  subjects,
  includedSubjectIds,
  onAddSubjects,
  onCreateSubject,
  loadError,
  theme = "theme-soft-blue",
}: PlannerSubjectSheetsProps) {
  const { t } = useTranslation(["planner", "common", "study-session"]);
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"duplicate" | "retry" | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameId = useId();
  const countId = useId();
  const over = name.length > SUBJECT_NAME_MAX;
  const createdByName = useRef(new Map<string, SubjectResponse>());
  const included = new Set(includedSubjectIds);
  const adding = selected.filter((id) => !included.has(id));
  const atSubjectLimit = subjects !== undefined && subjects.length >= MAX_SUBJECTS;

  const add = async () => {
    if (pending || subjects === undefined || adding.length === 0) return;
    setPending(true);
    setFailure(null);
    try {
      await onAddSubjects(dateKey, adding);
      setSelected([]);
      createdByName.current.clear();
      onOpenChange(false);
    } catch {
      setFailure("retry");
    } finally {
      setPending(false);
    }
  };

  const create = async () => {
    if (pending || over || name.trim().length === 0) return;
    setPending(true);
    setFailure(null);
    const trimmed = name.trim();
    let created = createdByName.current.get(trimmed);
    try {
      created ??= await onCreateSubject(trimmed);
      createdByName.current.set(trimmed, created);
      await onAddSubjects(dateKey, [created.id]);
      setName("");
      setCreating(false);
      createdByName.current.clear();
      onOpenChange(false);
    } catch (error) {
      setFailure(
        !created && error instanceof ApiError && error.status === 409 ? "duplicate" : "retry",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (!next && pending) {
          details.cancel();
          return;
        }
        if (!next) {
          setSelected([]);
          setFailure(null);
          setCreating(false);
          setName("");
          createdByName.current.clear();
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent variant="planner" className={theme} initialFocus={false} finalFocus={false}>
        {creating ? (
          <div className="flex flex-col gap-4.5 pt-4.5">
            <div className="flex items-center gap-1">
              <Button
                data-base-ui-swipe-ignore=""
                variant="unstyled"
                disabled={pending}
                aria-label={t("subjectSheet.back")}
                onClick={() => {
                  setCreating(false);
                  setFailure(null);
                }}
                className="relative -ml-1.5 size-8 p-0 before:absolute before:-inset-1.5"
              >
                <ChevronLeft aria-hidden size={22} />
              </Button>
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {t("subjectSheet.create")}
              </DrawerTitle>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
              className="flex flex-col gap-4.5"
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={nameId}
                  className="text-[13px] leading-4.5 font-semibold text-muted-foreground"
                >
                  {t("editor.aria.subjectName")}
                </label>
                <Input
                  id={nameId}
                  data-base-ui-swipe-ignore=""
                  autoFocus
                  className="border-[1.5px] leading-5.5 focus-visible:border-primary focus-visible:ring-0"
                  disabled={pending}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFailure(null);
                  }}
                  aria-invalid={over || undefined}
                  aria-describedby={
                    isCharCountVisible(name.length, SUBJECT_NAME_MAX, 0.75) ? countId : undefined
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.nativeEvent.isComposing)
                      event.preventDefault();
                  }}
                />
              </div>
              <CharCount
                id={countId}
                length={name.length}
                max={SUBJECT_NAME_MAX}
                showFrom={0.75}
                overMessage={t("editor.overLimit", { count: SUBJECT_NAME_MAX })}
              />
              {failure && (
                <p role="alert" className="text-sm text-state-distract-text">
                  {t(
                    failure === "duplicate"
                      ? "study-session:subjectSheet.duplicateName"
                      : "common:errors.retryLater",
                  )}
                </p>
              )}
              <Button
                data-base-ui-swipe-ignore=""
                type="submit"
                disabled={pending || over || !name.trim()}
                className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
              >
                {t("subjectSheet.createConfirm")}
              </Button>
            </form>
          </div>
        ) : (
          <div
            className={cn("flex flex-col", atSubjectLimit ? "gap-3.5 pt-3.5" : "gap-4.5 pt-4.5")}
          >
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-lg leading-6.5 font-bold">
                {t("subjectSheet.title")}
              </DrawerTitle>
              <span className="text-sm leading-5 font-semibold text-muted-foreground">
                {formatMonthDay(dateKey)}
              </span>
            </div>
            <div
              className={cn(
                "flex max-h-[60dvh] flex-col overflow-y-auto",
                atSubjectLimit ? "gap-3.5" : "gap-2.5",
              )}
            >
              <div className="flex items-center justify-between text-[13px] leading-4.5 font-semibold text-muted-foreground">
                <p>{t("subjectSheet.mySubjects")}</p>
                {atSubjectLimit && (
                  <span className="tabular-nums">
                    {subjects.length} / {MAX_SUBJECTS}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {subjects?.map((subject) => {
                  const already = included.has(subject.id);
                  const picked = adding.includes(subject.id);
                  const color = subjectColorVar(subject.colorIndex);
                  return (
                    <Button
                      key={subject.id}
                      variant="unstyled"
                      data-base-ui-swipe-ignore=""
                      aria-label={
                        already
                          ? t("subjectSheet.alreadyAdded", { name: subject.name })
                          : subject.name
                      }
                      aria-pressed={picked}
                      disabled={already || pending}
                      onClick={() =>
                        setSelected((current) =>
                          current.includes(subject.id)
                            ? current.filter((id) => id !== subject.id)
                            : [...current, subject.id],
                        )
                      }
                      className={cn(
                        "relative flex min-w-0 flex-col justify-center rounded-lg border-[1.5px] border-border bg-muted text-xs leading-4 font-semibold",
                        atSubjectLimit ? "h-15 gap-1 px-0.5 py-0" : "h-16 gap-1.5 p-0",
                        picked && "border-2 font-extrabold",
                        already && "bg-bg-layer-2 text-muted-foreground disabled:opacity-100",
                      )}
                      style={{
                        borderColor: picked
                          ? `color-mix(in srgb, ${color} 72%, var(--foreground))`
                          : undefined,
                        backgroundColor: picked
                          ? `color-mix(in srgb, ${color} 14%, var(--muted))`
                          : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "shrink-0",
                          atSubjectLimit ? "size-4.5 rounded-[5px]" : "size-5 rounded-[6px]",
                          already && "opacity-50",
                        )}
                        style={{
                          background: `color-mix(in srgb, ${color} 30%, var(--muted))`,
                          borderLeft: `3px solid ${color}`,
                        }}
                      />
                      <span
                        className={cn(
                          atSubjectLimit
                            ? "max-w-15 min-w-0 truncate"
                            : "max-w-full wrap-break-word whitespace-normal",
                        )}
                      >
                        {subject.name}
                      </span>
                      {already && !atSubjectLimit && (
                        <Check
                          aria-hidden
                          size={12}
                          strokeWidth={3}
                          className="absolute top-1.5 right-1.5"
                        />
                      )}
                    </Button>
                  );
                })}
                {subjects !== undefined && subjects.length < MAX_SUBJECTS && (
                  <Button
                    data-base-ui-swipe-ignore=""
                    variant="unstyled"
                    disabled={pending}
                    onClick={() => {
                      setCreating(true);
                      setFailure(null);
                    }}
                    className="flex h-16 min-w-0 flex-col justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong p-0 text-xs leading-4 font-semibold text-muted-foreground"
                  >
                    <Plus aria-hidden size={20} strokeWidth={2.2} />
                    {t("subjectSheet.create")}
                  </Button>
                )}
              </div>
              {loadError !== undefined ? (
                <ErrorState
                  message={t("study-session:subjectSheet.loadFailed")}
                  onRetry={loadError.retry}
                  screen="planner"
                />
              ) : (
                subjects === undefined && <Skeleton className="h-16 w-full rounded-lg" />
              )}
              {atSubjectLimit && (
                <p className="text-[13px] leading-4.5 text-muted-foreground">
                  {t("subjectSheet.limit")}
                </p>
              )}
            </div>
            {failure && (
              <p role="alert" className="text-sm text-state-distract-text">
                {t(
                  failure === "duplicate"
                    ? "study-session:subjectSheet.duplicateName"
                    : "common:errors.retryLater",
                )}
              </p>
            )}
            <Button
              data-base-ui-swipe-ignore=""
              disabled={pending || subjects === undefined || adding.length === 0}
              onClick={() => void add()}
              className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
            >
              {t("subjectSheet.addCount", { count: adding.length })}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
