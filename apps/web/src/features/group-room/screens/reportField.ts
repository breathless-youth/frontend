import i18n from "@/lib/i18n";

import { GROUP_ROOM_LIMITS } from "../model/limits";

/**
 * 신고 사유 입력칸과 보내기 버튼
 *
 * 신청 신고와 공부방 신고는 머리 줄과 설명만 다르고 사유 칸과 버튼은 같아서 한곳에 둔다.
 * 신고 사유는 비워도 보낼 수 있고 연락처·링크 판정을 하지 않는다.
 * 문구는 그릴 때 읽어야 화면 언어를 따르므로 상수가 아니라 함수로 둔다.
 */
export function reportField() {
  return {
    label: i18n.t("group-room:reportField.label"),
    placeholder: i18n.t("group-room:reportField.placeholder"),
    maxLength: GROUP_ROOM_LIMITS.reportReasonMax,
    required: false,
    checkContact: false,
    notice: i18n.t("group-room:reportField.notice"),
    submitLabel: i18n.t("group-room:reportField.submit"),
    submitTone: "danger",
  } as const;
}
