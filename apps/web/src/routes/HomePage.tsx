import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";

export function HomePage() {
  const { t } = useTranslation("home");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">FocusMakers</h1>
      <p className="text-muted-foreground text-sm">{t("demo.tagline")}</p>
      <Link to="/room/demo" className={buttonVariants()}>
        {t("demo.enter")}
      </Link>
    </main>
  );
}
