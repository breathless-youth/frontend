import { Check, Globe, Info, Lock, Send, Zap } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_BAR_CLASS, BOTTOM_CTA_CLASS } from "../bottomCta";
import { CategoryChips } from "../components/CategoryChips";
import { groupFieldError, isOverGroupLimit } from "../fieldError";
import { closesPendingRequests, joinPolicyText } from "../model/joinPolicy";
import type { RoomJoinPolicy } from "../model/joinPolicy";
import { GROUP_ROOM_LIMITS, countGroupText } from "../model/limits";
import type { RoomVisibility } from "../model/roomMenu";
import type { CategoryOption, RoomFormServerError, RoomFormValues } from "../types";
import { visibilityText } from "../visibility";

const SECTION_LABEL_CLASS = "pb-2 text-sm leading-5 font-bold text-foreground";

/**
 * 그룹 만들기와 그룹 설정
 *
 * 두 화면은 같은 양식이고, 공개와 비공개는 만든 뒤에 바꿀 수 없어 그룹 설정에서는 보여 주기만 한다.
 * 한도에서 입력을 자르면 iOS 한글 자판이 앞 글자를 덮어써서 글은 자르지 않고 만들기만 막는다.
 * 연락처·링크는 판정의 원본이 서버라 걸린 칸 아래에서 안내만 하고 만들기는 막지 않는다.
 * 서버가 막은 칸의 문장은 보낸 뒤 그 칸을 고치기 전까지만 보인다.
 * 그룹 개수와 멤버 수 한도는 다른 화면이 알려서 버튼 위에는 안내 글을 두지 않는다.
 */
export function RoomFormScreen({
  mode,
  categories,
  initial,
  pending,
  serverError = null,
  newRequestCount = 0,
  onBack,
  onSubmit,
}: {
  mode: "create" | "edit";
  categories: CategoryOption[];
  /** 처음 그릴 때만 읽고 그 뒤의 입력은 화면이 들고 있다. */
  initial: RoomFormValues;
  /** 보내는 중이면 버튼을 막아 같은 그룹이 두 번 만들어지지 않는다. */
  pending: boolean;
  /** 서버가 받지 않은 칸이 있으면 그 칸의 오류 줄에 이유를 보인다. */
  serverError?: RoomFormServerError | null;
  newRequestCount?: number;
  onBack: () => void;
  onSubmit: (values: RoomFormValues) => void;
}) {
  const { t } = useTranslation("group-room");
  const [values, setValues] = useState({
    ...initial,
    joinPolicy: initial.joinPolicy ?? "approval",
  });
  const [submitted, setSubmitted] = useState<RoomFormValues | null>(null);
  const nameId = useId();
  const visibilityTitleId = useId();
  const visibilityName = useId();
  const introId = useId();

  // 보낸 글을 고쳤다면 서버가 막은 이유는 지난 글의 것이라 그 칸 아래에 더 보이지 않는다.
  const serverMessage = (field: RoomFormServerError["field"]) =>
    serverError?.field === field && (submitted === null || submitted[field] === values[field])
      ? serverError.message
      : null;
  const nameError = groupFieldError(
    values.name,
    GROUP_ROOM_LIMITS.roomNameMax,
    true,
    serverMessage("name"),
  );
  const introError = groupFieldError(
    values.intro,
    GROUP_ROOM_LIMITS.roomIntroMax,
    true,
    serverMessage("intro"),
  );
  const canSubmit =
    !pending &&
    countGroupText(values.name) > 0 &&
    !isOverGroupLimit(values.name, GROUP_ROOM_LIMITS.roomNameMax) &&
    !isOverGroupLimit(values.intro, GROUP_ROOM_LIMITS.roomIntroMax);
  const submitLabel =
    mode === "create" ? t("roomFormScreen.submitCreate") : t("roomFormScreen.submitEdit");

  const update = (patch: Partial<RoomFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader
        title={mode === "create" ? t("roomFormScreen.titleCreate") : t("roomFormScreen.titleEdit")}
        onBack={onBack}
      />
      <div className="flex flex-col px-5 pt-4">
        <label htmlFor={nameId} className={SECTION_LABEL_CLASS}>
          {t("roomFormScreen.nameLabel")}
        </label>
        <FieldBox
          id={nameId}
          error={nameError}
          length={countGroupText(values.name)}
          max={GROUP_ROOM_LIMITS.roomNameMax}
          className="h-13 flex-row items-center gap-2"
        >
          <input
            id={nameId}
            type="text"
            autoComplete="off"
            value={values.name}
            onChange={(event) => update({ name: event.target.value })}
            aria-invalid={nameError !== null || undefined}
            aria-describedby={fieldDescribedBy(nameId, nameError)}
            className="min-w-0 flex-1 bg-transparent text-[15px] leading-5.5 font-semibold text-foreground outline-none"
          />
        </FieldBox>

        <p id={visibilityTitleId} className={cn(SECTION_LABEL_CLASS, "pt-4.5")}>
          {t(
            mode === "create"
              ? "joinPolicy.whoCanJoin"
              : values.visibility === "public"
                ? "joinPolicy.settingsLabel"
                : "roomFormScreen.visibilityLabel",
          )}
        </p>
        {mode === "create" || values.visibility === "public" ? (
          <>
            <div
              role="radiogroup"
              aria-labelledby={visibilityTitleId}
              className={cn("grid gap-2", mode === "create" ? "grid-cols-3" : "grid-cols-2")}
            >
              {(
                ["approval", "open", ...(mode === "create" ? (["private"] as const) : [])] as const
              ).map((choice) => (
                <EntryOption
                  key={choice}
                  name={visibilityName}
                  value={choice}
                  checked={
                    choice === "private"
                      ? values.visibility === "private"
                      : values.visibility === "public" && values.joinPolicy === choice
                  }
                  disabled={pending}
                  onSelect={() =>
                    update({
                      visibility: choice === "private" ? "private" : "public",
                      joinPolicy: choice === "open" ? "open" : "approval",
                    })
                  }
                />
              ))}
            </div>
            {mode === "edit" &&
              closesPendingRequests(
                initial.joinPolicy ?? "approval",
                values.joinPolicy,
                newRequestCount,
              ) && (
                <p
                  role="status"
                  className="mt-2.5 flex items-start gap-2 rounded-lg bg-bg-layer-2 px-3 py-2.5 text-[13px] leading-5 font-semibold text-foreground"
                >
                  <Info
                    aria-hidden="true"
                    size={16}
                    className="mt-0.5 shrink-0 text-brand-subtle-text"
                  />
                  {t("joinPolicy.pendingLoss", { count: newRequestCount })}
                </p>
              )}
          </>
        ) : (
          <FixedVisibility visibility={values.visibility} />
        )}

        <p className={cn(SECTION_LABEL_CLASS, "pt-4.5")}>{t("roomFormScreen.categoryLabel")}</p>
        <CategoryChips
          options={categories}
          value={values.category}
          onChange={(category) => update({ category })}
        />

        <label htmlFor={introId} className={cn(SECTION_LABEL_CLASS, "pt-4.5")}>
          {t("roomFormScreen.introLabel")}
        </label>
        <FieldBox
          id={introId}
          error={introError}
          length={countGroupText(values.intro)}
          max={GROUP_ROOM_LIMITS.roomIntroMax}
          className="flex-col items-end gap-1.5 pt-3 pb-2.5"
        >
          <textarea
            id={introId}
            rows={8}
            value={values.intro}
            onChange={(event) => update({ intro: event.target.value })}
            aria-invalid={introError !== null || undefined}
            aria-describedby={fieldDescribedBy(introId, introError)}
            className="w-full resize-none bg-transparent text-[15px] leading-5.5 text-foreground outline-none"
          />
        </FieldBox>
      </div>
      <div className={BOTTOM_CTA_BAR_CLASS}>
        <Button
          size="xl"
          disabled={!canSubmit}
          onClick={() => {
            setSubmitted(values);
            onSubmit(values);
          }}
          className={cn(BOTTOM_CTA_CLASS, "shadow-sb-cta disabled:shadow-none")}
        >
          {submitLabel}
        </Button>
      </div>
    </main>
  );
}

/** 입력칸이 가리키는 오류 줄과 글자 수의 id이고, 오류 줄은 있을 때만 가리킨다. */
function fieldDescribedBy(id: string, error: string | null): string {
  return error === null ? `${id}-count` : `${id}-error ${id}-count`;
}

/**
 * 글자 수를 세는 입력칸 상자와 그 아래 오류 한 줄
 *
 * 한 칸 아래에는 오류를 한 줄만 두어서, 글자 수 표시는 숫자만 상자 안에 두고 안내 문장은 오류 줄이 맡는다.
 */
function FieldBox({
  id,
  error,
  length,
  max,
  className,
  children,
}: {
  id: string;
  error: string | null;
  length: number;
  max: number;
  className: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "flex rounded-xl border border-border bg-muted px-4 focus-within:ring-2 focus-within:ring-(--state-focus)",
          className,
        )}
      >
        {children}
        <CharCount
          id={`${id}-count`}
          length={length}
          max={max}
          className="shrink-0 leading-4 text-muted-foreground"
        />
      </div>
      {error !== null && (
        <p
          id={`${id}-error`}
          role="alert"
          className="pt-2 text-[13px] leading-5 text-state-distract-text"
        >
          {error}
        </p>
      )}
    </>
  );
}

/** One radio tile for a public entry policy or private visibility. */
function EntryOption({
  name,
  value,
  checked,
  disabled,
  onSelect,
}: {
  name: string;
  value: RoomJoinPolicy | "private";
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = value === "private" ? Lock : value === "open" ? Zap : Send;
  const title = value === "private" ? visibilityText("private") : joinPolicyText(value);
  return (
    <label
      className={cn(
        "relative flex min-h-21 min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border bg-muted px-1.5 pt-3 pb-2.5 text-center has-focus-visible:ring-2 has-focus-visible:ring-(--state-focus)",
        checked
          ? "border-[1.5px] border-primary bg-brand-subtle text-brand-subtle-text"
          : "border-border text-muted-foreground",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {checked && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      <Icon aria-hidden="true" size={22} />
      <span className="text-sm leading-5 font-bold text-foreground">{title}</span>
    </label>
  );
}

/**
 * 그룹 설정의 공개 여부 줄
 *
 * 바꿀 수 없다는 안내를 같은 상자에 둔다.
 */
function FixedVisibility({ visibility }: { visibility: RoomVisibility }) {
  const { t } = useTranslation("group-room");
  const Icon = visibility === "public" ? Globe : Lock;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-bg-layer-2 px-4 py-3.5 text-muted-foreground">
      <Icon aria-hidden="true" size={20} className="mt-px shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] leading-5.5 font-bold text-foreground">
          {visibilityText(visibility)}
        </span>
        <span className="text-[13px] leading-5 break-keep">
          {t("roomFormScreen.fixedVisibilityNote")}
        </span>
      </span>
    </div>
  );
}
