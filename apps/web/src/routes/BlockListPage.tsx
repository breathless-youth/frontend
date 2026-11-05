import type { BlockListResponse } from "@focusmakers/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/ui/ErrorState";
import { toBlockedUserRow } from "@/features/group-room/fromApi";
import { groupRetryCopy, groupErrorCopy } from "@/features/group-room/groupErrorCopy";
import { BlockListScreen } from "@/features/group-room/screens/BlockListScreen";
import { useBackTo } from "@/features/group-room/useBackTo";
import { unblockUser } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  blocksQuery,
  cannotLoadFirst,
  groupKeys,
} from "@/lib/groupRoomQueries";
import { showToast } from "@/lib/toast";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 설정의 차단 목록
 *
 * 신원이 정해지기 전에는 그리지 않는다.
 * 첫 렌더의 빈 신원을 신원 없음으로 읽으면 차단한 사람이 없다는 문장이 잠깐 보이기 때문이다.
 */
export function BlockListPage() {
  const identityPending = useIdentityPending();
  const userId = useUserId();
  if (identityPending) {
    return null;
  }
  return <BlockList key={userId ?? "none"} userId={userId} />;
}

/**
 * 차단 목록 본문
 *
 * 차단 해제는 확인 없이 보내고, 풀리면 목록을 다시 받지 않고 받아 둔 목록에서 그 줄만 뺀다.
 * 푸는 동안에는 그 줄의 버튼을 막고 다른 줄의 해제도 받지 않아 한 번에 한 사람씩 푼다.
 * 신원 없이 연 브라우저는 차단 목록을 받을 수 없어 빈 목록을 보인다.
 */
function BlockList({ userId }: { userId: number | null }) {
  const queryClient = useQueryClient();
  const back = useBackTo("/settings");
  // 신원이 없으면 조회를 끄므로 키에 쓰는 번호는 쓰이지 않는다.
  const queryUserId = userId ?? 0;
  const listQuery = useQuery({ ...blocksQuery(queryUserId), enabled: userId !== null });
  const unblock = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (targetId: number) => unblockUser(targetId),
    onSuccess: (_data, targetId) => {
      queryClient.setQueryData<BlockListResponse>(groupKeys.blocks(queryUserId), (current) =>
        current === undefined
          ? current
          : { blockedUsers: current.blockedUsers.filter((user) => user.userId !== targetId) },
      );
    },
    onError: (error) => showToast(groupErrorCopy("unblock", error)),
  });

  return (
    <BlockListScreen
      users={(listQuery.data?.blockedUsers ?? []).map(toBlockedUserRow)}
      unblockingId={unblock.isPending ? unblock.variables : null}
      loading={userId !== null && listQuery.isPending}
      error={
        cannotLoadFirst(listQuery) ? (
          <ErrorState
            message={groupRetryCopy()}
            onRetry={() => void listQuery.refetch()}
            screen="group_tab"
          />
        ) : undefined
      }
      onBack={back}
      onUnblock={(targetId) => {
        if (!unblock.isPending) {
          unblock.mutate(targetId);
        }
      }}
    />
  );
}
