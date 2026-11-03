import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { groupErrorCopy } from "@/features/group-room/groupErrorCopy";
import { baseSearch } from "@/features/group-room/groupTabSearch";
import { normalizeInviteCode } from "@/features/group-room/model/inviteCode";
import { InviteCodeEntryScreen } from "@/features/group-room/screens/InviteCodeEntryScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { joinGroupByCode } from "@/lib/groupRoomApi";
import { GROUP_MUTATION_OPTIONS, invalidateGroupMembership } from "@/lib/groupRoomQueries";
import { haptic } from "@/lib/haptics";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 6자리 초대코드로 그룹 참여
 *
 * 신원이 정해지기 전에는 그리지 않는다.
 */
export function GroupJoinPage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  if (identityPending) {
    return null;
  }
  return <GroupJoin userId={userId} />;
}

/**
 * 그룹 참여 본문
 *
 * 링크로 받은 코드를 채운 채 시작하고, 그 코드를 고치지 않고 보내면 링크로 참여한 것으로 알린다.
 * 이미 멤버여도 서버가 그 그룹을 알려 줘서 참여한 때처럼 그룹 홈으로 바꿔 간다.
 * 온전한 코드를 붙여 넣으면 한 번에 값이 두 번 바뀌어서 입력이 바뀔 때는 보내지 않고 참여하기를 누를 때만 보낸다.
 * 신원 없이 연 브라우저는 참여할 수 없어 참여하기를 막는다.
 */
function GroupJoin({ userId }: { userId: number | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const back = useBackTo("/social");
  const [linkCode] = useState(() => normalizeInviteCode(searchParams.get("code") ?? ""));
  const [code, setCode] = useState(linkCode);
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (submitted: string) =>
      joinGroupByCode(submitted, submitted === linkCode ? "LINK" : "CODE"),
    onSuccess: ({ groupId }) => {
      if (userId !== null) {
        void invalidateGroupMembership(queryClient, userId, groupId);
      }
      navigate(
        { pathname: `/social/groups/${groupId}`, search: baseSearch(location.search) },
        { replace: true },
      );
    },
    onError: (failure) => {
      haptic("medium");
      setError(groupErrorCopy("join_code", failure));
    },
  });

  return (
    <InviteCodeEntryScreen
      value={code}
      onChange={(next) => {
        setCode(next);
        setError(null);
      }}
      error={error}
      pending={join.isPending || userId === null}
      onSubmit={() => {
        if (!join.isPending) {
          join.mutate(code);
        }
      }}
      onBack={back}
    />
  );
}
