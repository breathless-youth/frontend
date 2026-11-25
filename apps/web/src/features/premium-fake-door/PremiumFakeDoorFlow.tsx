import { ChevronLeft, Flame } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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

import { ApplyNotice } from "./ApplyNotice";
import {
  dailyPremiumPrice,
  PREMIUM_FEATURES,
  type PremiumFeature,
  type PremiumPlacement,
  type PremiumPrice,
} from "./premiumFakeDoor";
import { FEATURE_ART } from "./premiumFeatureArt";
import { SpartaHero } from "./SpartaHero";
import { type PremiumWaitlistRequest, putPremiumWaitlist } from "./premiumWaitlistApi";

const { LazySheet: LazyFeatureSheet, preload: preloadFeatureSheet } = lazyWithPreload(() =>
  import("./PremiumFeatureSheet").then((module) => module.PremiumFeatureSheet),
);

type Step = "benefits" | "done";

/**
 * 혜택 → 완료로 이어지는 전체 화면(확정 시안 R2·D1). "사전 신청하기" 한 번으로 저장한다
 *
 * 신청 흐름 전체는 시스템 테마와 무관하게 다크다(`theme-dark`, 세션 화면과 같은 방식). 결과 화면의 진입 카드는 사용자 테마를 따른다.
 * 혜택 화면은 스파르타 전용 색(`sparta-surface`)을 더 깐다.
 * 이메일은 받지 않는다. 만 14세 이상과 개인정보 이용 동의는 버튼 위 안내(`ApplyNotice`)로 갈음하고 `ageOver14`는 늘 true로 싣는다.
 *
 * 라우트가 아니라 같은 문서 위의 겹 화면이다. 결과 화면을 떠났다 돌아오면 연출과 보상 요청이 다시 돌기 때문이다.
 * `aria-modal`과 `data-covers-tab-bar`로 앱 탭 바를 숨기고, 앱의 뒤로 가기는 `useBackDismiss`로 이 화면만 닫는다.
 * 모달이 열리면 앱이 glass 층을 가리므로 위쪽 줄은 `GlassChrome`이 아니라 같은 모양의 CSS 버튼으로 그린다.
 */
export function PremiumFakeDoorFlow({
  price,
  placement,
  priceLabel,
  onClose,
  onApplied,
}: {
  price: PremiumPrice;
  placement: PremiumPlacement;
  priceLabel: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslation("premium-fake-door");
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>("benefits");
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
  const savedPick = useRef<PremiumFeature | null>(null);
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

  // 저장하는 동안의 되풀이 누름은 세지 않는다.
  const applyFrom = (from: "benefits" | "sheet") => {
    if (submitInFlight.current) return;
    trackPremiumFakeDoorApplyClicked(base, from);
    setSheetOpen(false);
    void submit();
  };

  // 서버가 204로 저장한 뒤에만 완료로 넘어간다. 실패하면 같은 버튼으로 다시 보낸다.
  const submit = async () => {
    const body: PremiumWaitlistRequest = {
      price,
      placement,
      ageOver14: true,
      email: null,
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
    trackPremiumFakeDoorApplied(base, "over14");
    onApplied();
    // 저장하는 동안 다시 연 설명 시트가 완료 화면을 덮지 않게 한다.
    setSheetOpen(false);
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
      savedPick.current = feature;
      setPickState("saved");
    } catch (error) {
      console.warn("[premium-fake-door] failed to save the expected feature", error);
      // 화면 선택을 서버에 저장된 값으로 돌린다. 그래야 같은 기능을 다시 눌러 재시도할 수 있다.
      setPicked(savedPick.current);
      setPickState("failed");
    } finally {
      pickInFlight.current = false;
    }
  };

  const ctaLabel = {
    benefits: t("benefits.cta"),
    done: placement === "SESSION" ? t("done.backToStudy") : t("done.backToResult"),
  }[step];

  function handlePrimary() {
    if (step === "benefits") {
      applyFrom("benefits");
    } else {
      onClose();
    }
  }

  const dialogLabel = {
    benefits: t("benefits.dialog"),
    done: t("done.dialog"),
  }[step];

  const failedLine = submitFailed && (
    <p role="alert" className="mb-2.5 text-center text-[13px] text-feedback-danger">
      {t("submitFailed")}
    </p>
  );

  let body: ReactNode;
  if (step === "benefits") {
    body = (
      <>
        {/* 머리: 위쪽 줄 밑까지 깔리는 불빛 배경, 작은 머리말, 불꽃 글자 제목, 240px 이글거리는 티미 */}
        <div className="sparta-hero-bg -mx-5 px-5 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-2 text-center">
          <p className="text-sm text-sparta-fg2">{t("benefits.kicker")}</p>
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="sparta-title-gradient mt-1.5 text-[40px] leading-11.5 font-black tracking-tighter outline-none"
          >
            {t("benefits.title")}
          </h2>
          <SpartaHero size={240} className="mx-auto mt-1 -mb-1" />
        </div>

        <SectionHeader small={t("benefits.sectionHint")} title={t("benefits.sectionTitle")} />
        <ul className="grid auto-rows-fr grid-cols-2 gap-2.5">
          {PREMIUM_FEATURES.map((id) => (
            <FeatureTile key={id} id={id} onOpen={openFeature} />
          ))}
        </ul>

        <SectionHeader
          small={t("stats.kicker")}
          title={
            <>
              <span className="block">{t("stats.titleLine1")}</span>
              <span className="block">{t("stats.titleLine2")}</span>
            </>
          }
        />
        <div className="sparta-stat-card rounded-[22px] px-4.5 py-5.5 text-center">
          <p className="text-[13px] font-bold text-sparta-hot2">{t("stats.breaksLabel")}</p>
          <p className="mt-1.5 text-[30px] leading-9 font-black tracking-[-0.03em]">
            {t("stats.breaksValue")}
          </p>
          <p className="mt-0.5 text-[13px] text-sparta-fg2">{t("stats.breaksSub")}</p>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <StatCell value={t("stats.pauseValue")} label={t("stats.pauseSub")} />
            <StatCell value={t("stats.distractValue")} label={t("stats.distractSub")} />
          </div>
          <p className="mt-4 text-base leading-6 font-bold break-keep">
            <span className="block">{t("stats.punchLine1")}</span>
            <span className="block">
              <Trans
                t={t}
                i18nKey="stats.punchLine2"
                components={{ hot: <em className="text-sparta-hot not-italic" /> }}
              />
            </span>
          </p>
          {/* 실제 기록의 출처는 믿을 근거라 작은 글자라도 또렷하게 읽히는 fg2로 둔다. */}
          <p className="mt-2.5 text-[11px] text-sparta-fg2">{t("stats.source")}</p>
        </div>

        <div className="mt-8.5 mb-3.5 text-center">
          <Flame size={16} aria-hidden="true" className="mx-auto text-sparta-hot" />
          <h3 className="mt-1 text-[21px] leading-7.25 font-extrabold tracking-[-0.03em]">
            {t("priceCard.title")}
          </h3>
        </div>
        <div className="rounded-xl border border-sparta-line bg-sparta-card p-4.5 text-center">
          <p className="text-[28px] leading-9 font-extrabold tracking-[-0.03em] tabular-nums">
            {priceLabel}
          </p>
          <p className="mt-1 text-[13px] text-sparta-fg2">
            {t("priceCard.perDay", { amount: dailyPremiumPrice(price) })}
          </p>
          <ul className="mt-3.5 grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-left">
            {PREMIUM_FEATURES.map((id) => (
              <li key={id} className="flex items-center gap-1.5 text-[12.5px] text-sparta-fg2">
                <img src={FEATURE_ART[id]} alt="" className="size-5.5 shrink-0 object-contain" />
                {t(`features.${id}.name`)}
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  } else {
    const legendId = `${headingId}-question`;
    body = (
      <div className="pt-2 text-center">
        <SpartaHero size={150} className="mx-auto mb-2" />
        <span className="inline-flex items-center gap-1 rounded-full bg-sparta-hot/15 px-3 py-1.5 text-[13px] font-bold text-sparta-hot2">
          <Flame size={14} aria-hidden="true" />
          {t("done.badge")}
        </span>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="sparta-title-gradient mt-2.5 text-[26px] leading-8.5 font-black tracking-[-0.04em] break-keep outline-none"
        >
          {t("done.title")}
        </h2>
        <p className="mt-2 text-sm leading-5.25 break-keep text-sparta-fg2">{t("done.byApp")}</p>
        <fieldset role="radiogroup" aria-labelledby={legendId} className="mt-6.5 text-left">
          <legend id={legendId} className="text-base font-extrabold">
            {t("done.question")}
          </legend>
          <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2">
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
          <p role="status" className="mt-3 text-center text-sm font-bold text-sparta-hot2">
            {t("done.thanks")}
          </p>
        )}
        {pickState === "failed" && (
          <p role="alert" className="mt-3 text-center text-[13px] text-feedback-danger">
            {t("done.pickFailed")}
          </p>
        )}
      </div>
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
      className={cn(
        "theme-dark fixed inset-0 z-50 flex flex-col animate-[result-fade-up_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        "sparta-surface bg-sparta-bg text-sparta-fg",
      )}
    >
      {/* 위쪽 줄은 본문 위에 얹는다. 혜택 화면은 본문 스크롤 영역이 이 줄 밑에서 시작해서 머리 그림의 불끝이 스크롤 영역 위 가장자리에 잘리지 않는다.
          줄의 빈 곳은 누름을 아래로 넘기고 버튼만 누름을 받는다. */}
      <div className="pointer-events-none relative z-10 page-width flex min-h-13 w-full shrink-0 items-center px-2 pt-[env(safe-area-inset-top)] [&>button]:pointer-events-auto">
        {step === "done" ? (
          <span className="size-11" aria-hidden="true" />
        ) : (
          <button
            type="button"
            aria-label={t("actions.back", { ns: "common" })}
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full bg-white/7 text-sparta-fg"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className={cn(
          "page-width w-full flex-1 overflow-y-auto px-5 pb-6",
          // 혜택 화면은 위쪽 줄 밑까지 끌어올려 머리 배경과 불끝이 화면 위 끝부터 보이게 한다. 위 여백은 머리가 준다.
          step === "benefits" && "-mt-[calc(env(safe-area-inset-top)+3.25rem)]",
        )}
      >
        {body}
      </div>
      <div
        className={cn(
          "page-width relative w-full shrink-0 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)]",
          // 아래 버튼 줄 위로 내용이 바탕색으로 흐려지며 사라진다.
          "before:pointer-events-none before:absolute before:inset-x-0 before:-top-7 before:h-7 before:bg-linear-to-b before:from-transparent before:to-sparta-bg",
        )}
      >
        {step === "benefits" && (
          <>
            {failedLine}
            <ApplyNotice />
          </>
        )}
        <Button
          type="button"
          size="xl"
          disabled={submitting}
          aria-busy={submitting}
          onClick={handlePrimary}
          variant="unstyled"
          className="sparta-cta h-13.5 w-full rounded-lg text-[17px] font-bold"
        >
          {ctaLabel}
        </Button>
      </div>
      <LazyFeatureSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        feature={sheetFeature}
        submitting={submitting}
        onApply={() => applyFrom("sheet")}
        returnFocus={sheetTileRef}
      />
    </div>,
    document.body,
  );
}

function SectionHeader({ small, title }: { small: string; title: ReactNode }) {
  return (
    <div className="mt-8.5 mb-3.5 text-center">
      <p className="text-[13px] text-sparta-fg3">{small}</p>
      <h3 className="mt-1 text-[21px] leading-7.25 font-extrabold tracking-[-0.03em] break-keep">
        {title}
      </h3>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[14px] bg-white/3 px-2 py-3">
      <p className="text-xl leading-7 font-black tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-[13px] break-keep text-sparta-fg2">{label}</p>
    </div>
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
  return (
    <li className="flex">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => onOpen(id, event.currentTarget)}
        className="flex w-full flex-col items-center rounded-xl border border-sparta-line bg-sparta-card px-2.5 pt-3 pb-3.5 text-center transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <img src={FEATURE_ART[id]} alt="" className="mt-3.5 mb-2.5 size-18 object-contain" />
        <span className="mt-1 text-[14.5px] font-bold tracking-[-0.02em] break-keep">
          {t(`features.${id}.name`)}
        </span>
        <span className="mt-0.5 text-xs leading-4 break-keep text-sparta-fg3">
          {id === "CHARACTER_ITEMS" ? t("features.CHARACTER_ITEMS.note") : t(`features.${id}.hook`)}
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
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col items-center gap-1 rounded-[18px] border-[1.5px] px-1.5 pt-2.5 pb-3 text-center text-[13px] font-bold break-keep has-focus-visible:ring-2 has-focus-visible:ring-(--state-focus)",
        checked ? "border-sparta-hot bg-sparta-warm" : "border-sparta-line bg-sparta-card",
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
      <img src={FEATURE_ART[id]} alt="" className="mt-1.5 mb-1 size-12 object-contain" />
      {t(`features.${id}.name`)}
    </label>
  );
}
