import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { contactPopupHref } from "@/features/contact-chat/contactPopup";

// 채널톡 메신저는 폭 430px 고정 판이라 양옆 여백을 두고 잘리지 않게 480으로 연다.
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 680;
const POPUP_MARGIN = 24;

/**
 * 화면 오른쪽 아래에 붙인 문의 창 설정
 *
 * availLeft·availTop은 표준 타입에 없어 없으면 0으로 본다.
 * 여러 모니터에서는 이 두 값이 지금 화면의 원점이라 브라우저가 놓인 화면에 창이 뜬다.
 * noopener를 넣으면 window.open이 늘 null을 돌려줘 성공과 차단을 구분할 수 없어 넣지 않는다.
 */
function popupFeatures(): string {
  const { availLeft = 0, availTop = 0 } = screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  const left = availLeft + screen.availWidth - POPUP_WIDTH - POPUP_MARGIN;
  const top = availTop + screen.availHeight - POPUP_HEIGHT - POPUP_MARGIN;
  return `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`;
}

function openPopup(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // 보조 키를 누른 클릭은 새 탭·새 창을 고른 것이라 브라우저에 맡긴다.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const popup = window.open(contactPopupHref(href), "_blank", popupFeatures());
  // 팝업이 막히면 null이라 링크 기본 동작으로 새 탭을 연다.
  if (popup === null) return;
  event.preventDefault();
  popup.focus();
}

/**
 * PC 홈 오른쪽 아래 문의 버튼
 *
 * 홈 문서는 COEP 때문에 상담 스크립트를 띄우지 못해, 예외 경로인 상담 화면을 새 문서로 연다.
 * 보던 홈과 공부 상태가 그대로 남도록 화면 오른쪽 아래에 작은 창으로 띄운다.
 * 작은 창에는 문의 창 표시를 붙인 주소를 열어 상담 화면이 닫기로 창을 닫게 하고, 막혀서 새 탭으로 열 때는 지금처럼 표시 없이 연다.
 * 주소는 폰 홈 문의와 같은 규칙으로 만든 값을 받는다.
 * ponytail: 상담 문서는 COOP가 달라 다른 창 그룹으로 떨어져 홈이 떠 있는 창을 다시 찾지 못하므로, 누를 때마다 새 창이 하나씩 뜬다.
 * 막으려면 상담 화면이 홈과 같은 COOP 아래에서 상담 스크립트를 띄울 수 있어야 해서 지금은 두지 않는다.
 */
export function PcContactButton({ href }: { href: string }) {
  const { t } = useTranslation("desktop");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={(event) => openPopup(event, href)}
      className="absolute right-6 bottom-6 flex min-h-11 items-center rounded-full bg-muted px-5 text-sm leading-4.5 font-semibold text-foreground shadow-sb-card transition-colors duration-150 hover:bg-bg-layer-2 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none motion-reduce:transition-none"
    >
      {t("home.contact")}
      {/* 보이는 이름 뒤에 띄어 붙여 낭독기가 한 단어로 읽지 않게 한다. */}{" "}
      <span className="sr-only">{t("home.newWindow")}</span>
    </a>
  );
}
