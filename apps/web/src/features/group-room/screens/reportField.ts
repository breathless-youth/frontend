import { GROUP_ROOM_LIMITS } from "../model/limits";

/**
 * 신고 사유 입력칸과 보내기 버튼
 *
 * 신청 신고와 공부방 신고는 머리 줄과 설명만 다르고 사유 칸과 버튼은 같아서 한곳에 둔다.
 * 신고 사유는 비워도 보낼 수 있고 연락처·링크 판정을 하지 않는다.
 */
export const REPORT_FIELD = {
  label: "신고 사유",
  placeholder: "어떤 점이 문제인지 적어 주세요",
  maxLength: GROUP_ROOM_LIMITS.reportReasonMax,
  required: false,
  checkContact: false,
  notice: "허위로 신고하면 이용이 제한될 수 있어요",
  submitLabel: "신고하기",
  submitTone: "danger",
} as const;
