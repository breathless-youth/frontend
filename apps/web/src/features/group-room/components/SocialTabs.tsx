import { useTranslation } from "react-i18next";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { SocialTab } from "../types";

const TRIGGER_CLASS =
  "group h-11.5 min-h-0 gap-1 px-0 text-base leading-5 font-semibold text-state-pause data-[state=active]:border-foreground data-[state=active]:font-bold data-[state=active]:text-foreground";

/**
 * 그룹 탭의 내 그룹과 공개 그룹 탭
 *
 * 들어간 그룹과 답을 기다리는 신청이 같은 5개 한도를 쓰므로 내 그룹 탭에만 둘을 합친 수를 붙인다.
 * 탭 이름과 수 사이의 띄어쓰기는 화면 낭독기가 읽는 이름을 위한 것이고, 보이는 간격은 탭의 gap이 맡는다.
 * 아래 내용은 탭 패널로 감싸지 않아, Radix가 붙이는 `aria-controls`가 없는 요소를 가리키지 않게 뺀다.
 */
export function SocialTabs({
  tab,
  myCountText,
  onTabChange,
}: {
  tab: SocialTab;
  myCountText: string;
  onTabChange: (tab: SocialTab) => void;
}) {
  const { t } = useTranslation("group-room");
  return (
    <Tabs value={tab} onValueChange={(next) => onTabChange(next as SocialTab)}>
      <TabsList aria-label={t("socialTabs.aria.list")} className="gap-5.5 border-border px-5">
        <TabsTrigger value="mine" aria-controls={undefined} className={TRIGGER_CLASS}>
          <span>{t("socialTabs.mine")}</span>{" "}
          <span className="font-semibold group-data-[state=active]:text-muted-foreground">
            {myCountText}
          </span>
        </TabsTrigger>
        <TabsTrigger value="public" aria-controls={undefined} className={TRIGGER_CLASS}>
          {t("socialTabs.public")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
