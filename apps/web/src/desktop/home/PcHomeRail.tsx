import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * PC 홈 왼쪽 위에 떠 있는 버튼 줄
 *
 * 버튼은 쓰는 쪽이 넘겨서, 배경음·타이머 버튼이 더해져도 이 틀은 그대로다.
 */
export function PcHomeRail({ children }: { children: ReactNode }) {
  const { t } = useTranslation("desktop");
  return (
    <div
      role="group"
      aria-label={t("home.rail")}
      className="absolute top-6 left-6 z-20 flex w-22 flex-col gap-1 rounded-xl bg-muted p-1.5 shadow-sb-card"
    >
      {children}
    </div>
  );
}
