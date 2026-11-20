import { useTranslation } from "react-i18next";

/**
 * PC 홈 오른쪽 아래 문의 버튼
 *
 * 홈 문서는 COEP 때문에 상담 스크립트를 띄우지 못해, 예외 경로인 상담 화면을 새 문서로 연다.
 * 새 탭으로 열어 보던 홈과 공부 상태가 그대로 남는다.
 * 주소는 폰 홈 문의와 같은 규칙으로 만든 값을 받는다.
 */
export function PcContactButton({ href }: { href: string }) {
  const { t } = useTranslation("desktop");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="absolute right-6 bottom-6 flex min-h-11 items-center rounded-full bg-muted px-5 text-sm leading-4.5 font-semibold text-foreground shadow-sb-card transition-colors duration-150 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none"
    >
      {t("home.contact")}
      {/* 보이는 이름 뒤에 띄어 붙여 낭독기가 한 단어로 읽지 않게 한다. */}{" "}
      <span className="sr-only">{t("home.newTab")}</span>
    </a>
  );
}
