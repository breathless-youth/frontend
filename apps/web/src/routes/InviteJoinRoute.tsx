import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { parseInviteParam } from "@/features/social-room/inviteParam";
import { trackGroupInviteLinkOpened } from "@/lib/amplitude";
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
 * 공개 그룹 링크는 신청 방식과 상관없이 그 그룹 소개를 연다.
 * 이 화면에서 다른 초대 링크를 열면 그 코드로 새로 시작하게 코드마다 새로 그린다.
 */
export function InviteJoinRoute() {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get("code");
  if (!hasGroupRooms()) {
    return <InviteCodeJoinPage />;
  }
  const invite = parseInviteParam(rawCode);
  if (invite?.kind === "room") {
    return <Navigate to={{ pathname: "/social", search: withoutCode(searchParams) }} replace />;
  }
  if (invite?.kind === "public") {
    return (
      <>
        <TrackLinkOpened kind="public" />
        <Navigate
          to={{ pathname: `/social/public/${invite.groupId}`, search: withoutCode(searchParams) }}
          replace
        />
      </>
    );
  }
  return (
    <>
      {invite?.kind === "group" && <TrackLinkOpened kind="group" />}
      <GroupJoinPage key={rawCode ?? ""} />
    </>
  );
}

function withoutCode(searchParams: URLSearchParams): string {
  const kept = new URLSearchParams(searchParams);
  kept.delete("code");
  return kept.toString();
}

/**
 * 초대 링크 진입 계측
 *
 * 셸의 앱 열림 계측은 어느 링크인지 모르므로 웹이 링크 종류를 한 번 더 남긴다.
 */
function TrackLinkOpened({ kind }: { kind: "group" | "public" }) {
  useEffect(() => {
    trackGroupInviteLinkOpened(kind);
  }, [kind]);
  return null;
}
