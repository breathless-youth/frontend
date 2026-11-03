import { ScreenBackHeader } from "@/components/ScreenBackHeader";

import { GROUP_ROOM_LIMITS } from "../model/limits";
import { WriteScreen } from "./WriteScreen";

/**
 * 공개 그룹 신청하기
 *
 * 신청에는 소개 글만 담고, 그룹장이 수락해야 멤버가 된다는 안내를 설명에서 한다.
 */
export function ApplyScreen({
  roomName,
  ownerNickname,
  value,
  onChange,
  pending,
  onSubmit,
  onBack,
}: {
  roomName: string;
  ownerNickname: string;
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <WriteScreen
      tone="light"
      header={<ScreenBackHeader title="신청하기" onBack={onBack} />}
      headline={`${roomName}에 신청할게요`}
      description={`그룹장 ${ownerNickname}님이 소개 글을 보고 수락하면 멤버가 돼요`}
      label="소개 글"
      value={value}
      onChange={onChange}
      maxLength={GROUP_ROOM_LIMITS.applicationMessageMax}
      required
      checkContact
      notice={`그룹장이 ${GROUP_ROOM_LIMITS.applicationTtlDays}일 안에 답하지 않으면 신청이 취소돼요`}
      submitLabel="신청 보내기"
      submitTone="primary"
      pending={pending}
      onSubmit={onSubmit}
    />
  );
}
