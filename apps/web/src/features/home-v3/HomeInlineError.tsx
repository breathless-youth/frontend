import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function HomeInlineError({ label, retry }: { label: string; retry: () => void }) {
  const { t } = useTranslation("home");
  return (
    <div className="flex min-h-19 items-center justify-between gap-2 rounded-xl bg-muted px-4 text-sm text-muted-foreground">
      <p role="alert">{label}</p>
      <Button variant="ghost" className="min-h-11 shrink-0 text-primary" onClick={retry}>
        {t("v3.retry")}
      </Button>
    </div>
  );
}
