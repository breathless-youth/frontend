import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { dropFromMyGroups, forgetGroup, invalidateGroupMembership } from "@/lib/groupRoomQueries";
import { useUserId } from "@/lib/userId";

import { groupErrorCopy, isGroupGoneError } from "./groupErrorCopy";
import { baseSearch } from "./groupTabSearch";

/**
 * 사라진 그룹에서 그룹 탭으로 돌아가기
 *
 * 그룹 화면을 보는 사이 내보내지거나 그룹이 사라지면 오류 화면에 머물지 않고 그룹 탭으로 바꿔 가서 이유를 한 번 띄운다.
 * 안내는 그룹 탭이 띄우도록 남기고, 이 웹뷰 안의 이동이라 `noticeHandoff`는 넘기지 않는다.
 * 그룹 탭이 내 그룹을 다시 받는 동안 사라진 그룹 카드가 보이지 않게 이동하기 전에 받아 둔 목록에서 뺀다.
 * 화면을 벗어난 뒤에 그 그룹의 조회를 캐시에서 빼고 내 그룹 목록은 다시 받게 한다.
 */
export function useLeaveWhenGone(error: unknown, groupId: number): void {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const userId = useUserId();
  // 같은 오류로 여러 번 그려져도 안내와 이동은 한 번만 한다.
  const handled = useRef(false);
  const gone = isGroupGoneError(error);
  const leave = useEffectEvent((signedInUserId: number) => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    markSocialRoomNotice({ kind: "failure", message: groupErrorCopy("load", error) });
    dropFromMyGroups(queryClient, signedInUserId, groupId);
    navigate({ pathname: "/social", search: baseSearch(location.search) }, { replace: true });
  });

  useEffect(() => {
    if (!gone || userId === null) {
      return;
    }
    leave(userId);
    return () => {
      forgetGroup(queryClient, userId, groupId);
      void invalidateGroupMembership(queryClient, userId);
    };
  }, [gone, queryClient, userId, groupId]);
}
