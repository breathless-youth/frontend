import { useTranslation } from "react-i18next";
import mascot from "@/assets/home-v3/mascot-contact.png";
import { Button } from "@/components/ui/button";
import { HomeDesignIcon } from "./HomeDesignIcon";
import { tapped } from "./homeShortcutTap";

/**
 * 홈 맨 아래 문의 말풍선
 *
 * 음성 제어로 보이는 문구를 말해 누를 수 있게 버튼 이름은 말풍선 문구에서 시작한다.
 * 문구만으로는 무엇을 여는지 모호해 화면에 보이지 않는 문의하기를 이름 끝에 붙인다.
 */
export function HomeContactBubble({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation("home");
  return (
    <Button
      variant="unstyled"
      className="h-auto min-h-16 w-full items-center justify-start gap-2 rounded-xl bg-bg-layer-2 p-2 text-left"
      onClick={tapped("contact", onOpen)}
    >
      <span className="size-12 shrink-0 overflow-hidden rounded-full bg-muted">
        <img src={mascot} alt="" width={48} height={48} className="size-full" />
      </span>
      <span className="flex min-h-12 flex-1 items-center gap-2 rounded-full bg-muted pr-3.5 pl-4">
        <span className="flex-1 py-1.5 text-sm leading-5 font-medium text-balance break-keep text-foreground">
          {t("v3.contact.bubble")} <span className="sr-only">{t("v3.contact.label")}</span>
        </span>
        <HomeDesignIcon name="chevron" className="text-text-tertiary" />
      </span>
    </Button>
  );
}
