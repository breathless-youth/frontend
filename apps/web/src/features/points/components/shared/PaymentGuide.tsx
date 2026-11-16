import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { slideNavigate } from "@/lib/pageTransition";
import { cn } from "@/lib/utils";

import { pointsItemSearch, pointsSearch } from "../../pointsSearch";

const PAYMENT_GUIDE_PATH = "/points/payment-guide";

const SECTIONS = [
  { title: "charged", lines: ["unusedPaid", "spent", "deleteAccount"] },
  { title: "sets", lines: ["setUnworn", "setWorn"] },
  { title: "storeAndMinors", lines: ["storeRefund", "negative", "minor"] },
] as const;

/**
 * 결제·환불 안내 화면으로 가는 링크
 *
 * 충전 칸과 세트 결제 버튼 위에 같은 모양으로 둔다.
 * 소품 화면은 고른 마스코트·부위·상품을 주소에 남기지 않아서, 보던 상품을 넘기면 지금 주소를 그 상품을 골라 여는 주소로 바꾼 뒤에 이동한다.
 * 그래서 뒤로 돌아오면 같은 상품을 골라 둔 채로 다시 열린다.
 */
export function PaymentGuideLink({ itemId }: { itemId?: string }) {
  const { t } = useTranslation("points-earn");
  const navigate = useNavigate();
  const location = useLocation();
  const to = { pathname: PAYMENT_GUIDE_PATH, search: pointsSearch(location.search) };
  return (
    // 글자는 작게 두고 누르는 범위만 위아래로 넓힌다.
    <Link
      to={to}
      onClick={(event) => {
        event.preventDefault();
        slideNavigate("forward", () => {
          if (itemId !== undefined) {
            navigate(
              { pathname: location.pathname, search: pointsItemSearch(location.search, itemId) },
              { replace: true },
            );
          }
          navigate(to);
        });
      }}
      className="relative self-center text-[11px] font-medium text-muted-foreground/80 underline underline-offset-2 before:absolute before:-inset-x-3 before:-inset-y-4"
    >
      {t("charge.guide")}
    </Link>
  );
}

/**
 * 결제·환불 안내 본문
 *
 * 약관처럼 소제목 아래에 규칙을 점 목록으로 둔다.
 * 문의는 바로 아래 버튼으로 하므로 문의 안내 문장은 두지 않는다.
 * 앱은 웹뷰가 다른 주소로 나가는 것을 막아서 이용약관은 앱 안의 약관 화면으로 연다.
 */
export function PaymentGuideContent() {
  const { t } = useTranslation("points-earn");
  const headingId = useId();
  return (
    <div className="flex flex-1 flex-col gap-6 pt-3">
      {SECTIONS.map(({ title, lines }) => (
        <section
          key={title}
          aria-labelledby={`${headingId}-${title}`}
          className="flex flex-col gap-2"
        >
          <h2 id={`${headingId}-${title}`} className="text-[15px] font-bold break-keep">
            {t(`paymentGuide.sections.${title}`)}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm leading-6 break-keep text-muted-foreground">
            {lines.map((line) => (
              <li key={line}>{t(`paymentGuide.${line}`)}</li>
            ))}
          </ul>
        </section>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1 pt-4">
        <Link
          to="/contact"
          className={cn(buttonVariants({ size: "xl", variant: "secondary" }), "w-full")}
        >
          {t("paymentGuide.contactAction")}
        </Link>
        <Link
          to="/terms"
          className="flex min-h-11 items-center px-3 text-[13px] font-semibold text-primary underline underline-offset-2"
        >
          {t("paymentGuide.terms")}
        </Link>
        <p className="text-xs text-muted-foreground">{t("paymentGuide.seller")}</p>
      </div>
    </div>
  );
}
