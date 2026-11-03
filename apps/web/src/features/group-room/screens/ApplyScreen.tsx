import { useTranslation } from "react-i18next";

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
  serverError,
  onSubmit,
  onBack,
}: {
  roomName: string;
  ownerNickname: string;
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  /** 서버가 글을 받지 않은 이유이고, 글을 고치면 호출부가 비운다. */
  serverError?: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("group-room");
  return (
    <WriteScreen
      tone="light"
      header={<ScreenBackHeader title={t("applyScreen.title")} onBack={onBack} />}
      headline={t("applyScreen.headline", { roomName })}
      description={t("applyScreen.description", { nickname: ownerNickname })}
      label={t("applyScreen.label")}
      value={value}
      onChange={onChange}
      maxLength={GROUP_ROOM_LIMITS.applicationMessageMax}
      required
      checkContact
      notice={t("applyScreen.notice", { count: GROUP_ROOM_LIMITS.applicationTtlDays })}
      submitLabel={t("applyScreen.submit")}
      submitTone="primary"
      pending={pending}
      serverError={serverError}
      onSubmit={onSubmit}
    />
  );
}
