import { Navigate, useSearchParams } from "react-router-dom";

import { GroupLoginGate } from "@/features/login/GroupLoginGate";
import { parseInviteParam } from "@/features/social-room/inviteParam";
import { hasGroupRooms } from "@/lib/groupRoomCapability";
import { GroupJoinPage } from "@/routes/GroupJoinPage";
import { InviteCodeJoinPage } from "@/routes/InviteCodeJoinPage";

/**
 * 초대 링크의 참여 화면 고르기
 *
 * 그룹 공부방 표시가 있으면 6자리 그룹 참여를 연다.
 * 표시가 있는 앱에는 예전 방이 없어서 숫자 4자리 링크는 참여 화면도 오류도 띄우지 않고 그룹 탭을 연다.
 * 그 코드는 그룹 탭에서 쓰지 않아 주소에서 뺀다.
 * 웹은 설치된 모든 앱에 한꺼번에 나가서, 표시가 없는 예전 앱은 강제 업데이트 전까지 지금 참여 화면을 그대로 연다.
 * 표시가 없는 브라우저도 같은 화면을 열고, 그 화면이 브라우저에서 4자리와 6자리 코드를 모두 보인다.
 * 이 화면에서 다른 초대 링크를 열면 그 코드로 새로 시작하게 코드마다 새로 그린다.
 */
export function InviteJoinRoute() {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get("code");
  if (!hasGroupRooms()) {
    return <InviteCodeJoinPage />;
  }
  if (parseInviteParam(rawCode)?.kind === "room") {
    const kept = new URLSearchParams(searchParams);
    kept.delete("code");
    return <Navigate to={{ pathname: "/social", search: kept.toString() }} replace />;
  }
  return (
    <GroupLoginGate entry="invite">
      <GroupJoinPage key={rawCode ?? ""} />
    </GroupLoginGate>
  );
}
