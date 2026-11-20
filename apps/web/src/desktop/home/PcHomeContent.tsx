import { useState, type ReactNode } from "react";

import { HomeStudyBlocks } from "@/features/home-v3/HomeV3Content";
import type { HomeV3ContentProps } from "@/features/home-v3/homeV3ContentTypes";

import { PcContactButton } from "./PcContactButton";
import { PcHomeRail } from "./PcHomeRail";
import { PcSpaceFlyout } from "./PcSpaceFlyout";
import { PcStudyPanel } from "./PcStudyPanel";
import { PcWallpaper } from "./PcWallpaper";

export interface PcHomeContentProps extends HomeV3ContentProps {
  /** 레일 맨 위 D-Day 버튼. 토큰 출처가 없는 문서는 비운다. */
  dday: ReactNode;
  /** 문의 버튼이 새 탭으로 열 상담 화면 주소 */
  contactHref: string;
}

/**
 * PC 홈 본문
 *
 * 폰 새 홈과 같은 값과 동작을 받아 월페이퍼 위에 레일·공부시간 패널·문의 버튼을 띄운다.
 * 이 상자를 플라이아웃의 포털 자리로 넘겨 플라이아웃이 상자 기준으로 놓이고 홈 테마를 물려받는다.
 * 키보드가 레일 → 패널 → 문의 순서로 가도록 문서 순서를 두고, 겹침은 층 값으로 정한다.
 */
export function PcHomeContent({ dday, contactHref, ...content }: PcHomeContentProps) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className="absolute inset-0 overflow-hidden">
      <PcWallpaper />
      <PcHomeRail>
        {dday}
        <PcSpaceFlyout container={box} />
      </PcHomeRail>
      <PcStudyPanel
        studySeconds={content.stats.status === "success" ? content.stats.value.studySeconds : null}
      >
        <HomeStudyBlocks {...content} />
      </PcStudyPanel>
      <PcContactButton href={contactHref} />
    </div>
  );
}
