import { useSearchParams } from "react-router-dom";

import { parseInviteParam } from "@/features/social-room/inviteParam";
import { hasGroupRooms } from "@/lib/groupRoomCapability";
import { GroupJoinPage } from "@/routes/GroupJoinPage";
import { InviteCodeJoinPage } from "@/routes/InviteCodeJoinPage";

/**
 * 초대 링크의 참여 화면 고르기
 *
 * 그룹 공부방 표시가 있으면 6자리 그룹 참여를 열고, 예전 앱 친구가 보낸 숫자 4자리 링크는 표시가 있어도 예전 방 참여로 연다.
 * 표시가 없는 예전 앱과 브라우저는 지금 참여 화면을 열고, 그 화면이 브라우저에서 4자리와 6자리 코드를 모두 보인다.
 * 이 화면에서 다른 초대 링크를 열면 그 코드로 새로 시작하게 코드마다 새로 그린다.
 */
export function InviteJoinRoute() {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get("code");
  if (hasGroupRooms() && parseInviteParam(rawCode)?.kind !== "room") {
    return <GroupJoinPage key={rawCode ?? ""} />;
  }
  return <InviteCodeJoinPage />;
}
