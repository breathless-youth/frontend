import { useTranslation } from "react-i18next";

/**
 * "사전 신청하기" 버튼 위 안내 두 줄(확정 시안 D1)
 *
 * 첫 줄은 결제 안내, 둘째 줄은 누르면 만 14세 이상이고 개인정보 이용에 동의한 것으로 본다는 안내다.
 * 동의 화면을 대신하므로 첫 줄보다 밝은 색을 쓴다. 혜택 화면과 설명 시트가 같이 쓴다.
 */
export function ApplyNotice() {
  const { t } = useTranslation("premium-fake-door");
  return (
    <p className="mb-2.5 text-center text-xs leading-4.25 break-keep text-sparta-fg3">
      <span className="block">{t("billing")}</span>
      <span className="block text-sparta-fg2">{t("consent")}</span>
    </p>
  );
}
