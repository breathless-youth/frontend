import { Check, X } from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useBackDismiss } from "@/lib/backDismiss";

import type { PremiumFeature } from "./premiumFakeDoor";
import { FEATURE_ICONS } from "./premiumFeatureIcons";

/**
 * 혜택 타일을 눌렀을 때 올라오는 기능 설명 시트(시안 E1-b2)
 *
 * 딤 누르기, X, Esc, 앱의 뒤로 가기는 시트만 닫고 신청 화면은 그대로 둔다.
 * 닫히면 누른 타일로 포커스를 돌려준다. 시트는 body로 나가므로 Soft Blue 테마를 시트에도 단다.
 * `drawer.tsx`를 끌어오므로 신청 화면이 `lazyWithPreload`로 나눠 받는다.
 */
export function PremiumFeatureSheet({
  open,
  onOpenChange,
  feature,
  onApply,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: PremiumFeature | null;
  onApply: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("premium-fake-door");
  useBackDismiss(open, () => onOpenChange(false));
  const Icon = feature === null ? null : FEATURE_ICONS[feature];
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="theme-soft-blue" finalFocus={returnFocus}>
        {feature !== null && Icon !== null && (
          <div className="flex max-h-[85dvh] flex-col">
            <DrawerClose
              aria-label={t("sheet.close")}
              data-base-ui-swipe-ignore
              className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted-foreground"
            >
              <X size={20} aria-hidden="true" />
            </DrawerClose>
            <div className="min-h-0 flex-1 overflow-y-auto pt-6">
              <span
                aria-hidden="true"
                className="flex size-13 items-center justify-center rounded-xl bg-brand-subtle text-primary"
              >
                <Icon size={28} />
              </span>
              <p className="mt-4 inline-block rounded-full bg-bg-layer-2 px-2.25 py-0.75 text-xs font-semibold text-muted-foreground">
                {t("sheet.tag")}
              </p>
              <DrawerTitle className="mt-1.5 text-2xl leading-8 font-bold tracking-[-0.03em] break-keep">
                {t(`features.${feature}.name`)}
              </DrawerTitle>
              {feature === "CHARACTER_ITEMS" && (
                <p className="text-[13px] text-muted-foreground">
                  {t("features.CHARACTER_ITEMS.note")}
                </p>
              )}
              <p className="mt-3 text-[17px] leading-6 font-bold tracking-[-0.02em] break-keep">
                {t(`features.${feature}.hook`)}
              </p>
              <p className="mt-2 text-[15px] leading-5.75 break-keep text-muted-foreground">
                {/* 줄을 나눠 보이는 설명이 있어 문단을 줄 배열로 두고 한 줄씩 그린다. */}
                {t(`features.${feature}.description`, { returnObjects: true }).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {t(`features.${feature}.bullets`, { returnObjects: true }).map((bullet) => (
                  <li key={bullet} className="flex gap-2.5 text-[15px] leading-5.5 break-keep">
                    <Check
                      size={18}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-primary"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 pt-5">
              <p className="mb-3 text-center text-[13px] leading-4.75 break-keep text-muted-foreground">
                {t("billing")}
              </p>
              <Button
                type="button"
                size="xl"
                data-base-ui-swipe-ignore
                onClick={onApply}
                className="shadow-sb-cta w-full"
              >
                {t("benefits.cta")}
              </Button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
