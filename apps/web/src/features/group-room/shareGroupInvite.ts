import { shareInvite } from "@/features/social-room/shareInvite";
import { showToast } from "@/lib/toast";

/** 공유 시트가 없어 초대 글을 복사했을 때의 토스트이고 지금 방 초대코드 화면과 같은 문장이다. */
export const INVITE_COPIED_COPY = "초대코드를 복사했어요";

/**
 * 그룹 초대코드 공유
 *
 * 지금 방 초대와 같은 공유 본문과 링크를 쓰고, 공유 시트 대신 복사했으면 복사했다고 알린다.
 */
export async function shareGroupInvite(inviteCode: string): Promise<void> {
  if ((await shareInvite(inviteCode)) === "copied") {
    showToast(INVITE_COPIED_COPY);
  }
}
