import { useTranslation } from "react-i18next";

/** 보관 중인 타임랩스가 없을 때의 안내. 홈 목록과 전체 목록이 함께 쓴다. */
export function TimelapsesEmpty() {
  const { t } = useTranslation("timelapse");
  return (
    <p className="bg-muted text-muted-foreground shadow-sb-card rounded-xl px-5 py-6 text-center text-sm">
      {t("empty.body")}
    </p>
  );
}
