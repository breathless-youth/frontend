import { Globe, Lock } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_BAR_CLASS, BOTTOM_CTA_CLASS } from "../bottomCta";
import { CategoryChips } from "../components/CategoryChips";
import { groupFieldError, isOverGroupLimit } from "../fieldError";
import { GROUP_ROOM_LIMITS, countGroupText } from "../model/limits";
import type { RoomVisibility } from "../model/roomMenu";
import type { CategoryOption, RoomFormServerError, RoomFormValues } from "../types";
import { VISIBILITY_TEXT } from "../visibility";

const VISIBILITY_OPTIONS: { value: RoomVisibility; description: string }[] = [
  { value: "public", description: "공개 그룹 목록에 보이고, 신청을 받아 그룹장이 수락해요" },
  { value: "private", description: "초대 링크나 코드를 받은 사람만 들어와요" },
];

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
  onBack: () => void;
  onSubmit: (values: RoomFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
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
  const submitLabel = mode === "create" ? "그룹 만들기" : "저장하기";

  const update = (patch: Partial<RoomFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader title={mode === "create" ? "그룹 만들기" : "그룹 설정"} onBack={onBack} />
      <div className="flex flex-col px-5 pt-4">
        <label htmlFor={nameId} className={SECTION_LABEL_CLASS}>
          그룹 이름
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
          누가 들어올 수 있나요?
        </p>
        {mode === "create" ? (
          <div
            role="radiogroup"
            aria-labelledby={visibilityTitleId}
            className="flex flex-col gap-2"
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <VisibilityOption
                key={option.value}
                name={visibilityName}
                value={option.value}
                description={option.description}
                checked={values.visibility === option.value}
                onSelect={() => update({ visibility: option.value })}
              />
            ))}
          </div>
        ) : (
          <FixedVisibility visibility={values.visibility} />
        )}

        <p className={cn(SECTION_LABEL_CLASS, "pt-4.5")}>시험·목표</p>
        <CategoryChips
          options={categories}
          value={values.category}
          onChange={(category) => update({ category })}
        />

        <label htmlFor={introId} className={cn(SECTION_LABEL_CLASS, "pt-4.5")}>
          그룹 소개
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

/**
 * 공개와 비공개 고르기 카드
 *
 * 카드 전체를 눌러 고르고, 이름은 공개 여부만 읽히고 설명은 설명으로 따로 읽힌다.
 */
function VisibilityOption({
  name,
  value,
  description,
  checked,
  onSelect,
}: {
  /** 같은 화면의 두 카드가 한 라디오 묶음이 되게 하는 이름. */
  name: string;
  value: RoomVisibility;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 has-checked:border-[1.5px] has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-(--state-focus)">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-px size-5 shrink-0 rounded-full border-2 border-border-strong peer-checked:border-6 peer-checked:border-primary"
      />
      <span className="flex min-w-0 flex-col">
        <span id={titleId} className="text-[15px] leading-5.5 font-bold text-foreground">
          {VISIBILITY_TEXT[value]}
        </span>
        <span id={descriptionId} className="text-[13px] leading-5 break-keep text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

/**
 * 그룹 설정의 공개 여부 줄
 *
 * 바꿀 수 없다는 안내를 같은 상자에 둔다.
 */
function FixedVisibility({ visibility }: { visibility: RoomVisibility }) {
  const Icon = visibility === "public" ? Globe : Lock;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-bg-layer-2 px-4 py-3.5 text-muted-foreground">
      <Icon aria-hidden="true" size={20} className="mt-px shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] leading-5.5 font-bold text-foreground">
          {VISIBILITY_TEXT[visibility]}
        </span>
        <span className="text-[13px] leading-5 break-keep">
          공개와 비공개는 그룹을 만든 뒤에 바꿀 수 없어요
        </span>
      </span>
    </div>
  );
}
