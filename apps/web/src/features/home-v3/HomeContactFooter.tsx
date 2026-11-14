import { useTranslation } from "react-i18next";
import mascot from "@/assets/home-v3/mascot-contact.png";
import { Button } from "@/components/ui/button";
import { HomeDesignIcon } from "./HomeDesignIcon";
import { tapped } from "./homeShortcutTap";

/**
 * 홈 맨 아래 문의 푸터
 *
 * 배경 없이 홈 배경 위 가운데에 마스코트와 문구만 둔다.
 * 음성 제어로 보이는 문구를 말해 누를 수 있게 버튼 이름은 보이는 문구에서 시작한다.
 * 문구만으로는 무엇을 여는지 모호해 화면에 보이지 않는 문의하기를 이름 끝에 붙인다.
 */
export function HomeContactFooter({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation("home");
  return (
    // 위 카드 줄과의 간격은 부모 간격 12px에 이 상자의 14px를 더해 26px이다.
    // 내용이 짧으면 남는 높이를 위로 밀어 문구가 탭 바 바로 위에 놓인다.
    <div className="mt-auto">
      <footer className="flex justify-center pt-3.5 pb-3">
        <Button
          variant="unstyled"
          className="h-auto min-h-11 max-w-full gap-0.5 p-0 text-left"
          onClick={tapped("contact", onOpen)}
        >
          {/* 연필심이 위로 솟아 그림이 아래로 쏠려 보여, 몸통 가운데로 문구가 지나도록 3px 올린다. */}
          <span className="size-8 shrink-0 -translate-y-0.75">
            <img src={mascot} alt="" width={32} height={32} className="size-full" />
          </span>
          <span className="flex min-h-11 min-w-0 items-center gap-1">
            <span className="min-w-0 py-1 text-[13px] leading-4.5 font-medium text-balance break-keep text-foreground">
              {t("v3.contact.bubble")} <span className="sr-only">{t("v3.contact.label")}</span>
            </span>
            <HomeDesignIcon name="chevron" className="text-text-tertiary" />
          </span>
        </Button>
      </footer>
    </div>
  );
}
