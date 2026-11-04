import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { type DeskTone, arrangeDesks } from "../model/desks";
import type { RoomDeskMember } from "../types";
import { DeskFigure } from "./DeskFigure";

const NAME_CLASS: Record<DeskTone | "empty", string> = {
  room: "font-semibold text-foreground",
  elsewhere: "font-semibold text-foreground",
  rest: "text-muted-foreground",
  empty: "text-state-pause",
};

/**
 * 그룹 카드의 작은 책상 여섯 자리
 *
 * 카드 전체가 버튼 하나라서 버튼 안에 둘 수 있는 글 요소로만 만든다.
 * 카드가 공부 상태 문장을 따로 읽어 주므로 책상 줄은 화면 낭독기에서 뺀다.
 */
export function DeskRow({ members }: { members: readonly RoomDeskMember[] }) {
  const { t } = useTranslation("group-room");
  // 판단 모듈이 순서를 정하며 멤버를 공통 모양으로 돌려주므로 내 자리는 아이디로 다시 찾는다.
  const myUserId = members.find((member) => member.isMe)?.userId;
  return (
    <span aria-hidden="true" data-testid="desk-row" className="grid grid-cols-6 gap-0.5">
      {arrangeDesks(members).map((slot, index) => {
        const tone = slot.kind === "empty" ? "empty" : slot.tone;
        const name = slot.kind === "empty" ? t("deskRow.emptySeat") : slot.member.nickname;
        const isMe = slot.kind !== "empty" && slot.member.userId === myUserId;
        return (
          <span
            key={slot.kind === "empty" ? `empty-${index}` : slot.member.userId}
            data-tone={tone}
            data-me={isMe || undefined}
            className={cn(
              "flex min-w-0 flex-col items-center",
              // 음수 여백을 안쪽 여백과 테두리로 되돌려 자리가 밀리지 않는다.
              isMe && "-m-0.5 rounded-sm border border-primary/40 bg-brand-subtle p-px",
            )}
          >
            <DeskFigure tone={tone} size="sm" />
            <span
              className={cn(
                "block w-full truncate pt-0.5 text-center text-[10px] leading-3.5",
                // 흐린 글자는 라이트의 내 자리 바탕 위에서 대비가 4.1:1이라 내 자리에서는 쓰지 않는다.
                isMe ? "font-bold text-foreground" : NAME_CLASS[tone],
              )}
            >
              {name}
            </span>
          </span>
        );
      })}
    </span>
  );
}
