import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { RoomFab } from "../components/RoomFab";
import { SocialTabs } from "../components/SocialTabs";
import type { SocialTab } from "../types";
import { MyRoomsView } from "./MyRoomsView";
import { PublicRoomsView } from "./PublicRoomsView";

/**
 * 그룹 탭 화면
 *
 * 두 탭 모두 같은 `+` 버튼을 쓰므로 버튼은 탭 본문 밖에 한 번만 둔다.
 * 신청 중인 공개 그룹 시트는 Base UI가 첫 묶음에 들어가지 않게 따로 받는 묶음으로 그려서 호출부가 만들어 넘긴다.
 */
export function SocialHomeScreen({
  tab,
  onTabChange,
  myCountText,
  mine,
  publicRooms,
  fab,
  pendingSheet,
}: {
  tab: SocialTab;
  onTabChange: (tab: SocialTab) => void;
  myCountText: string;
  mine: ComponentProps<typeof MyRoomsView>;
  publicRooms: ComponentProps<typeof PublicRoomsView>;
  fab: ComponentProps<typeof RoomFab>;
  pendingSheet: ReactNode;
}) {
  const { t } = useTranslation("group-room");
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col pt-[calc(env(safe-area-inset-top)+17px)] pb-(--tab-bar-reserve) text-foreground">
      <h1 className="px-5 text-[24px] leading-7.5 font-bold text-foreground">
        {t("socialHomeScreen.title")}
      </h1>
      <div className="mt-4">
        <SocialTabs tab={tab} myCountText={myCountText} onTabChange={onTabChange} />
      </div>
      {tab === "mine" ? <MyRoomsView {...mine} /> : <PublicRoomsView {...publicRooms} />}
      {/* 끝까지 내렸을 때 마지막 카드가 떠 있는 + 버튼에 가리지 않게 버튼 높이와 위아래 간격만큼 비운다. */}
      <div aria-hidden="true" className="h-22 shrink-0" />
      <RoomFab {...fab} />
      {pendingSheet}
    </main>
  );
}
