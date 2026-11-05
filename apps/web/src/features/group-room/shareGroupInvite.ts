import { shareInvite } from "@/features/social-room/shareInvite";
import i18n from "@/lib/i18n";
import { showToast } from "@/lib/toast";

/**
 * 그룹 초대코드 공유
 *
 * 지금 방 초대와 같은 공유 본문과 링크를 쓰고, 공유 시트 대신 복사했으면 복사했다고 알린다.
 * 복사 토스트는 지금 방 초대코드 화면과 같은 문장이라 그 화면의 카탈로그 키를 함께 쓴다.
 */
export async function shareGroupInvite(inviteCode: string): Promise<void> {
  if ((await shareInvite(inviteCode)) === "copied") {
    showToast(i18n.t("social-room:share.copied"));
  }
}
