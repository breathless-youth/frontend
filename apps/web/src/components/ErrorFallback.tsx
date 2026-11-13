import { useTranslation } from "react-i18next";

import lampiSurprised from "@/assets/mascot/lampi-surprised.png";
import { trackErrorFallbackReloaded } from "@/lib/amplitude";

/**
 * 라우트 레벨 ErrorBoundary의 폴백(BY-372) — 렌더 크래시 시 흰 화면 대신 뜬다.
 *
 * `ui/ErrorState`를 재사용하지 않은 이유: 그건 화면 **일부**의 조회 실패 자리표시(카드형,
 * 버튼 문구 "다시 시도" 고정)이고, 여기는 React 트리가 통째로 죽은 뒤라 전체 화면 + 전체
 * 리로드가 맞다. 카메라·비전·브리지가 얽힌 세션 화면은 부분 복구보다 처음부터 다시 로드하는
 * 것이 안전하다 — 그래서 resetKeys류 세밀 리셋(react-error-boundary)이 없는 구성으로 충분하다.
 */
export function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <img
        src={lampiSurprised}
        alt=""
        width={106}
        height={96}
        draggable={false}
        className="mb-4 h-24 w-auto"
      />
      <h1 className="text-lg font-semibold">{t("errorFallback.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorFallback.description")}</p>
      <button
        type="button"
        onClick={() => {
          trackErrorFallbackReloaded();
          window.location.reload();
        }}
        className="mt-3 min-h-11 rounded-full bg-brand-subtle px-6 text-sm font-semibold text-primary"
      >
        {t("errorFallback.reload")}
      </button>
    </main>
  );
}
