import { useTranslation } from "react-i18next";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";

import { reportField } from "./reportField";
import { WriteScreen } from "./WriteScreen";

/**
 * 그룹장이 받은 신청 신고하기
 *
 * 신고하면 그 신청은 바로 거절되고, 신청한 사람에게는 신고 사실을 알리지 않는다.
 */
export function ReportApplicationScreen({
  nickname,
  value,
  onChange,
  pending,
  serverError,
  onSubmit,
  onBack,
}: {
  nickname: string;
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
      header={<ScreenBackHeader title={t("reportApplicationScreen.title")} onBack={onBack} />}
      headline={t("reportApplicationScreen.headline", { nickname })}
      description={t("reportApplicationScreen.description")}
      {...reportField()}
      value={value}
      onChange={onChange}
      pending={pending}
      serverError={serverError}
      onSubmit={onSubmit}
    />
  );
}
