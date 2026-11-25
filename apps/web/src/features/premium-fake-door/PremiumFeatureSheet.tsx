import { Flame, X } from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useBackDismiss } from "@/lib/backDismiss";

import { ApplyNotice } from "./ApplyNotice";
import type { PremiumFeature } from "./premiumFakeDoor";
import { FEATURE_ART } from "./premiumFeatureArt";

/**
 * 혜택 타일을 눌렀을 때 올라오는 기능 설명 시트(확정 시안 R2)
 *
 * 딤 누르기, X, Esc, 앱의 뒤로 가기는 시트만 닫고 신청 화면은 그대로 둔다.
 * 닫히면 누른 타일로 포커스를 돌려준다. 시트는 body로 나가므로 신청 화면과 같은 다크·스파르타 색을 시트에도 단다.
 * `drawer.tsx`를 끌어오므로 신청 화면이 `lazyWithPreload`로 나눠 받는다.
 */
export function PremiumFeatureSheet({
  open,
  onOpenChange,
  feature,
  submitting,
  onApply,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: PremiumFeature | null;
  /** 신청을 저장하는 중이면 시트의 신청 버튼도 막는다. */
  submitting: boolean;
  onApply: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation("premium-fake-door");
  useBackDismiss(open, () => onOpenChange(false));
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="theme-dark sparta-surface" finalFocus={returnFocus}>
        {feature !== null && (
          <div className="flex max-h-[86dvh] flex-col text-sparta-fg">
            <DrawerClose
              aria-label={t("sheet.close")}
              data-base-ui-swipe-ignore
              className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-sparta-fg2"
            >
              <X size={20} aria-hidden="true" />
            </DrawerClose>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-7 text-center">
              <p className="text-[13px] font-semibold break-keep text-sparta-hot2">
                {t(`features.${feature}.hook`)}
              </p>
              <DrawerTitle className="mt-1 text-[21px] leading-7.25 font-extrabold tracking-[-0.03em] break-keep">
                {t(`features.${feature}.name`)}
              </DrawerTitle>
              {feature === "CHARACTER_ITEMS" && (
                <p className="mt-0.5 text-xs text-sparta-fg3">
                  {t("features.CHARACTER_ITEMS.note")}
                </p>
              )}
              <img
                src={FEATURE_ART[feature]}
                alt=""
                className="mx-auto mt-3.5 mb-2.5 size-30 object-contain"
              />
              <p className="text-sm leading-5.25 break-keep text-sparta-fg2">
                {/* 줄을 나눠 보이는 설명이 있어 문단을 줄 배열로 두고 한 줄씩 그린다. */}
                {t(`features.${feature}.description`, { returnObjects: true }).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <ul className="mt-3.5 grid gap-2 rounded-[14px] bg-sparta-card2 px-3.5 py-3 text-left">
                {t(`features.${feature}.bullets`, { returnObjects: true }).map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-[13.5px] leading-4.75 break-keep">
                    <Flame
                      size={14}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-sparta-hot"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 pt-4">
              <ApplyNotice />
              <Button
                type="button"
                size="xl"
                data-base-ui-swipe-ignore
                disabled={submitting}
                aria-busy={submitting}
                onClick={onApply}
                variant="unstyled"
                className="sparta-cta h-13.5 w-full rounded-lg text-[17px] font-bold"
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
