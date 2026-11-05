import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

export function GroupNotificationSheet({
  open,
  onOpenChange,
  onAccept,
  onShown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  onShown: () => void;
}) {
  const { t } = useTranslation("group-room");
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="theme-soft-blue"
        ref={(node) => {
          if (node !== null && open) onShown();
        }}
      >
        <div
          aria-hidden="true"
          className="mt-4.5 flex size-11 items-center justify-center rounded-full bg-brand-subtle text-primary"
        >
          <Bell size={24} className="fill-current" />
        </div>
        <DrawerTitle className="mt-3.5 text-lg leading-6.5 font-bold">
          {t("notificationPrompt.title")}
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-sm leading-5 text-muted-foreground">
          {t("notificationPrompt.description")}
        </DrawerDescription>
        <div data-base-ui-swipe-ignore="" className="mt-5 flex flex-col gap-2">
          <Button
            size="xl"
            className="h-14 rounded-[20px] text-[17px] font-bold shadow-sb-cta"
            onClick={onAccept}
          >
            {t("notificationPrompt.accept")}
          </Button>
          <Button
            variant="secondary"
            className="h-13 rounded-2xl text-[15px] font-semibold"
            onClick={() => onOpenChange(false)}
          >
            {t("notificationPrompt.later")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
