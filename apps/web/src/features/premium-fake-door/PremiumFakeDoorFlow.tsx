import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  trackPremiumFakeDoorApplied,
  trackPremiumFakeDoorApplyClicked,
  trackPremiumFakeDoorFeatureSelected,
  trackPremiumFakeDoorFeatureViewed,
} from "@/lib/amplitude";
import { useBackDismiss } from "@/lib/backDismiss";
import { haptic } from "@/lib/haptics";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { cn } from "@/lib/utils";

import {
  type EmailStepErrors,
  PREMIUM_FEATURES,
  type PremiumFeature,
  type PremiumPlacement,
  type PremiumPrice,
  validateEmailStep,
} from "./premiumFakeDoor";
import { FEATURE_ICONS } from "./premiumFeatureIcons";
import { type PremiumWaitlistRequest, putPremiumWaitlist } from "./premiumWaitlistApi";

const { LazySheet: LazyFeatureSheet, preload: preloadFeatureSheet } = lazyWithPreload(() =>
  import("./PremiumFeatureSheet").then((module) => module.PremiumFeatureSheet),
);

type Step = "benefits" | "age" | "email" | "done";

const NO_ERRORS: EmailStepErrors = { email: null, consent: false };

/**
 * 혜택 → 14세 확인 → 이메일·동의 → 완료로 이어지는 전체 화면(시안 E1-b1)
 *
 * 라우트가 아니라 같은 문서 위의 겹 화면이다. 결과 화면을 떠났다 돌아오면 연출과 보상 요청이 다시 돌기 때문이다.
 * `aria-modal`과 `data-covers-tab-bar`로 앱 탭 바를 숨기고, 앱의 뒤로 가기는 `useBackDismiss`로 이 화면만 닫는다.
 * 모달이 열리면 앱이 glass 층을 가리므로 위쪽 줄은 `GlassChrome`이 아니라 같은 모양의 CSS 버튼으로 그린다.
 */
export function PremiumFakeDoorFlow({
  price,
  placement,
  priceLabel,
  nickname,
  onClose,
  onApplied,
}: {
  price: PremiumPrice;
  placement: PremiumPlacement;
  priceLabel: string;
  nickname: string | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslation("premium-fake-door");
  const headingId = useId();
  const emailId = useId();
  const errorId = useId();
  const consentErrorId = useId();
  const termsId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>("benefits");
  const [ageOver14, setAgeOver14] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<EmailStepErrors>(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [applied, setApplied] = useState<PremiumWaitlistRequest | null>(null);
  const [picked, setPicked] = useState<PremiumFeature | null>(null);
  const [pickState, setPickState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // 닫히는 동안에도 내용이 남도록 고른 기능과 열림을 따로 둔다.
  const [sheetFeature, setSheetFeature] = useState<PremiumFeature | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetTileRef = useRef<HTMLElement | null>(null);
  const submitInFlight = useRef(false);
  const pickInFlight = useRef(false);
  const base = { price, placement };

  useBackDismiss(true, onClose);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // 혜택 화면이 열리면 설명 시트 코드를 미리 받아 첫 누름에 늦지 않게 한다.
  useEffect(() => {
    void preloadFeatureSheet();
  }, []);

  const openFeature = (feature: PremiumFeature, tile: HTMLElement) => {
    sheetTileRef.current = tile;
    setSheetFeature(feature);
    setSheetOpen(true);
    trackPremiumFakeDoorFeatureViewed(base, feature);
  };

  const applyFrom = (from: "benefits" | "sheet") => {
    trackPremiumFakeDoorApplyClicked(base, from);
    setSheetOpen(false);
    goTo("age");
  };

  const goTo = (next: Step) => {
    setSubmitFailed(false);
    setErrors(NO_ERRORS);
    setStep(next);
  };

  const back = () => {
    if (step === "benefits") onClose();
    else if (step === "age") goTo("benefits");
    else if (step === "email") goTo("age");
  };

  // 서버가 204로 저장한 뒤에만 완료로 넘어간다. 실패하면 같은 버튼으로 다시 보낸다.
  const submit = async (over14: boolean) => {
    if (submitInFlight.current) return;
    const body: PremiumWaitlistRequest = {
      price,
      placement,
      ageOver14: over14,
      email: over14 ? email.trim() : null,
      expectedFeature: null,
    };
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      await putPremiumWaitlist(body);
    } catch (error) {
      console.warn("[premium-fake-door] failed to save the application", error);
      haptic("medium");
      setSubmitFailed(true);
      return;
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
    trackPremiumFakeDoorApplied(base, over14 ? "over14" : "under14");
    onApplied();
    setApplied(body);
    setStep("done");
  };

  const pick = async (feature: PremiumFeature) => {
    if (applied === null || pickInFlight.current) return;
    setPicked(feature);
    pickInFlight.current = true;
    setPickState("saving");
    try {
      await putPremiumWaitlist({ ...applied, expectedFeature: feature });
      // 저장이 된 선택만 센다. 실패 뒤 다시 누를 때마다 세면 기능 분포가 부푼다.
      trackPremiumFakeDoorFeatureSelected(base, feature);
      setPickState("saved");
    } catch (error) {
      console.warn("[premium-fake-door] failed to save the expected feature", error);
      setPickState("failed");
    } finally {
      pickInFlight.current = false;
    }
  };

  const ctaLabel = {
    benefits: t("benefits.cta"),
    age: ageOver14 ? t("age.next") : t("age.applyByApp"),
    email: t("email.submit"),
    done: placement === "RESULT" ? t("done.backToResult") : t("done.backToHome"),
  }[step];

  function handlePrimary() {
    if (step === "benefits") {
      applyFrom("benefits");
    } else if (step === "age") {
      if (ageOver14) goTo("email");
      else void submit(false);
    } else if (step === "email") {
      const next = validateEmailStep(email, consent);
      setErrors(next);
      if (next.email === null && !next.consent) void submit(true);
    } else {
      onClose();
    }
  }

  const dialogLabel = {
    benefits: t("benefits.dialog"),
    age: t("age.dialog"),
    email: t("email.dialog"),
    done: t("done.dialog"),
  }[step];
  const stepLabel =
    step === "age"
      ? t("apply.step", { current: 1, total: 2 })
      : step === "email"
        ? t("apply.step", { current: 2, total: 2 })
        : null;

  const failedLine = submitFailed && (
    <p role="alert" className="mt-2 px-1 text-[13px] text-feedback-danger">
      {t("submitFailed")}
    </p>
  );

  let body: ReactNode;
  if (step === "benefits") {
    body = (
      <>
        <div className="mt-3 flex items-center justify-between gap-2.5">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl leading-8 font-bold tracking-[-0.03em] outline-none"
          >
            {t("benefits.title")}
          </h2>
          <span className="shrink-0 rounded-full bg-brand-subtle px-3 py-1.5 text-sm font-bold text-primary tabular-nums">
            {priceLabel}
          </span>
        </div>
        <ul className="mt-5 grid auto-rows-fr grid-cols-2 gap-2.5">
          {PREMIUM_FEATURES.map((id) => (
            <FeatureTile key={id} id={id} onOpen={openFeature} />
          ))}
        </ul>
        <p className="mt-3 text-center text-[13px] leading-4.75 break-keep text-muted-foreground">
          {t("benefits.tapHint")}
        </p>
      </>
    );
  } else if (step === "age") {
    body = (
      <>
        <StepTitle id={headingId} headingRef={headingRef}>
          {t("age.title")}
        </StepTitle>
        <p className="mt-2 text-sm leading-5 break-keep text-muted-foreground">{t("age.sub")}</p>
        <label
          className={cn(
            "mt-7 flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-4 text-base font-semibold",
            ageOver14 ? "border-primary bg-brand-subtle" : "border-border bg-muted",
          )}
        >
          <Checkbox
            checked={ageOver14}
            onCheckedChange={(checked) => {
              setAgeOver14(checked === true);
              setSubmitFailed(false);
            }}
            className="size-5.5 rounded-md"
          />
          {t("age.check")}
        </label>
        {failedLine}
      </>
    );
  } else if (step === "email") {
    const emailError = errors.email === null ? null : t(`email.errors.${errors.email}`);
    body = (
      <>
        <StepTitle id={headingId} headingRef={headingRef}>
          {t("email.title")}
        </StepTitle>
        <div className="mt-6">
          <label htmlFor={emailId} className="mb-2 block px-1 text-sm font-semibold">
            {t("email.label")}
          </label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("email.placeholder")}
            value={email}
            aria-invalid={emailError !== null}
            // 오류일 때는 포커스 중에도 테두리와 링을 위험 색으로 둔다.
            className="aria-invalid:border-feedback-danger aria-invalid:focus-visible:ring-feedback-danger"
            aria-describedby={emailError !== null ? errorId : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email !== null) setErrors((prev) => ({ ...prev, email: null }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handlePrimary();
            }}
          />
          {emailError !== null && (
            <p id={errorId} role="alert" className="mt-1.5 px-1 text-[13px] text-feedback-danger">
              {emailError}
            </p>
          )}
        </div>
        <div
          className={cn(
            "mt-4.5 rounded-lg bg-bg-layer-2 px-3.5 pt-1.5 pb-2.5",
            errors.consent && "ring-[1.5px] ring-feedback-danger ring-inset",
          )}
        >
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold">
            <Checkbox
              checked={consent}
              aria-invalid={errors.consent}
              aria-describedby={errors.consent ? consentErrorId : undefined}
              onCheckedChange={(checked) => {
                setConsent(checked === true);
                if (checked === true) setErrors((prev) => ({ ...prev, consent: false }));
              }}
              className="size-5.5 rounded-md"
            />
            {t("email.consent")}
          </label>
          <p className="pl-8.5 text-[13px] leading-4.75 break-keep text-muted-foreground">
            {t("email.consentLine")}
          </p>
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={termsId}
            onClick={() => setDetailsOpen((open) => !open)}
            className="ml-7 flex min-h-11 items-center gap-1 px-1.5 text-[13px] font-semibold text-muted-foreground"
          >
            {t("email.details")}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn(
                "transition-transform motion-reduce:transition-none",
                detailsOpen && "rotate-180",
              )}
            />
          </button>
          {detailsOpen && (
            <dl
              id={termsId}
              className="mb-1 ml-8.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px] leading-4.5 break-keep"
            >
              <dt className="font-semibold whitespace-nowrap text-muted-foreground">
                {t("email.terms.itemLabel")}
              </dt>
              <dd>{t("email.terms.item")}</dd>
              <dt className="font-semibold whitespace-nowrap text-muted-foreground">
                {t("email.terms.purposeLabel")}
              </dt>
              <dd>{t("email.terms.purpose")}</dd>
              <dt className="font-semibold whitespace-nowrap text-muted-foreground">
                {t("email.terms.periodLabel")}
              </dt>
              <dd>{t("email.terms.period")}</dd>
              <dt className="font-semibold whitespace-nowrap text-muted-foreground">
                {t("email.terms.refuseLabel")}
              </dt>
              <dd>{t("email.terms.refuse")}</dd>
            </dl>
          )}
          {errors.consent && (
            <p id={consentErrorId} role="alert" className="pl-8.5 text-[13px] text-feedback-danger">
              {t("email.errors.consent")}
            </p>
          )}
        </div>
        {failedLine}
      </>
    );
  } else {
    const legendId = `${headingId}-question`;
    body = (
      <>
        <div
          aria-hidden="true"
          className="mx-auto mt-3 flex size-15 items-center justify-center rounded-full bg-brand-subtle text-primary"
        >
          <Check size={30} strokeWidth={2.5} />
        </div>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="mt-3.5 text-center text-[22px] leading-7.5 font-bold tracking-[-0.03em] outline-none"
        >
          {nickname ? t("done.title", { nickname }) : t("done.titleNoName")}
        </h2>
        <p className="mt-1 text-center text-[15px] text-muted-foreground">{t("done.sub")}</p>
        <p className="mt-1 text-center text-[13px] break-all text-muted-foreground">
          {applied?.email ? t("done.byEmail", { email: applied.email }) : t("done.byApp")}
        </p>
        <fieldset role="radiogroup" aria-labelledby={legendId} className="mt-7">
          <legend id={legendId} className="text-base font-bold">
            {t("done.question")}
          </legend>
          <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2.5">
            {PREMIUM_FEATURES.map((id) => (
              <FeatureRadio
                key={id}
                id={id}
                name={`${headingId}-feature`}
                checked={picked === id}
                disabled={pickState === "saving"}
                onSelect={() => void pick(id)}
              />
            ))}
          </div>
        </fieldset>
        {pickState === "saved" && (
          <p role="status" className="mt-2.5 text-center text-[13px] font-semibold text-primary">
            {t("done.thanks")}
          </p>
        )}
        {pickState === "failed" && (
          <p role="alert" className="mt-2.5 text-center text-[13px] text-feedback-danger">
            {t("done.pickFailed")}
          </p>
        )}
      </>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      data-covers-tab-bar=""
      onKeyDown={(event) => {
        // 시트는 이 화면의 React 자식이라 시트의 Esc도 여기로 올라온다. 시트만 닫히게 둔다.
        if (event.key === "Escape" && !sheetOpen) {
          event.stopPropagation();
          onClose();
        }
      }}
      className="theme-soft-blue bg-soft-blue fixed inset-0 z-50 flex flex-col text-foreground animate-[result-fade-up_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
    >
      <div className="page-width flex min-h-13 w-full shrink-0 items-center px-2 pt-[env(safe-area-inset-top)]">
        {step === "done" ? (
          <span className="size-11" aria-hidden="true" />
        ) : (
          <button
            type="button"
            aria-label={t("actions.back", { ns: "common" })}
            onClick={back}
            className="flex size-11 items-center justify-center rounded-full glass-surface"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
        <p className="flex-1 text-center text-[17px] font-bold">
          {stepLabel === null ? "" : t("apply.header")}
        </p>
        <span className="w-11 text-center text-[13px] font-bold text-muted-foreground tabular-nums">
          {stepLabel}
        </span>
      </div>
      <div className="page-width w-full flex-1 overflow-y-auto px-5 pb-6">{body}</div>
      <div className="page-width w-full shrink-0 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {step === "benefits" && (
          <p className="mb-3 text-center text-[13px] leading-4.75 break-keep text-muted-foreground">
            {t("billing")}
          </p>
        )}
        <Button
          type="button"
          size="xl"
          disabled={submitting}
          aria-busy={submitting}
          onClick={handlePrimary}
          className="shadow-sb-cta w-full"
        >
          {ctaLabel}
        </Button>
      </div>
      <LazyFeatureSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        feature={sheetFeature}
        onApply={() => applyFrom("sheet")}
        returnFocus={sheetTileRef}
      />
    </div>,
    document.body,
  );
}

function StepTitle({
  id,
  headingRef,
  children,
}: {
  id: string;
  headingRef: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      ref={headingRef}
      tabIndex={-1}
      className="mt-3 text-2xl leading-8 font-bold tracking-[-0.03em] break-keep outline-none"
    >
      {children}
    </h2>
  );
}

function FeatureTile({
  id,
  onOpen,
}: {
  id: PremiumFeature;
  onOpen: (feature: PremiumFeature, tile: HTMLElement) => void;
}) {
  const { t } = useTranslation("premium-fake-door");
  const Icon = FEATURE_ICONS[id];
  return (
    <li className="flex">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => onOpen(id, event.currentTarget)}
        className="relative flex min-h-27 w-full flex-col items-start justify-start gap-3.5 rounded-lg bg-bg-layer-2 px-3.5 pt-4 pb-3.5 text-left transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Icon size={24} className="text-primary" aria-hidden="true" />
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="absolute top-3 right-2.5 text-text-tertiary"
        />
        <span>
          <span className="block text-[15px] leading-5.25 font-semibold tracking-[-0.02em] break-keep">
            {t(`features.${id}.name`)}
          </span>
          {id === "CHARACTER_ITEMS" && (
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
              {t("features.CHARACTER_ITEMS.note")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function FeatureRadio({
  id,
  name,
  checked,
  disabled,
  onSelect,
}: {
  id: PremiumFeature;
  name: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("premium-fake-door");
  const Icon = FEATURE_ICONS[id];
  return (
    <label
      className={cn(
        "relative flex min-h-24 cursor-pointer flex-col justify-start gap-3.5 rounded-lg border px-3.5 pt-4 pb-3.5 has-focus-visible:ring-2 has-focus-visible:ring-(--state-focus)",
        checked ? "border-primary bg-brand-subtle" : "border-transparent bg-bg-layer-2",
      )}
    >
      <input
        type="radio"
        name={name}
        value={id}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <Icon size={24} className="text-primary" aria-hidden="true" />
      <span className="block text-[15px] leading-5.25 font-semibold tracking-[-0.02em] break-keep">
        {t(`features.${id}.name`)}
      </span>
    </label>
  );
}
