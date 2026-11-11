import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

import type { Mascot, MascotId } from "../../types";
import { MascotImage } from "../shared/MascotImage";

/**
 * 프로필 수정의 내 마스코트 줄
 *
 * 폼의 저장 버튼과 상관없이 누르는 즉시 바뀐다.
 * 잠긴 마스코트는 흐리게 보이고 눌러도 아무 일도 없다.
 */
export function ProfileMascotRow({
  mascots,
  onSelect,
  decorateTo,
}: {
  mascots: Mascot[];
  onSelect: (id: MascotId) => void;
  decorateTo: string;
}) {
  const { t } = useTranslation("points-mascots");
  const { t: tPoints } = useTranslation("points");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">{t("profile.title")}</p>
        <Link
          to={decorateTo}
          className="flex min-h-11 items-center text-[13px] font-bold text-primary"
        >
          {t("profile.decorate")} ›
        </Link>
      </div>
      <ul
        aria-label={t("profile.pick")}
        className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-muted p-2.5"
      >
        {mascots.map((mascot) => {
          const name = tPoints(`mascots.${mascot.id}`);
          return (
            <li key={mascot.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={mascot.unlocked ? mascot.selected : undefined}
                aria-disabled={mascot.unlocked ? undefined : true}
                aria-label={mascot.unlocked ? undefined : t("profile.locked", { name })}
                onClick={() => mascot.unlocked && onSelect(mascot.id)}
                className="flex min-h-11 min-w-11 flex-col items-center gap-1 focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative flex size-13 items-center justify-center rounded-lg border",
                    mascot.selected
                      ? "border-2 border-primary bg-brand-subtle"
                      : mascot.unlocked
                        ? "border-border bg-muted"
                        : "border-border bg-bg-layer-2",
                  )}
                >
                  <MascotImage id={mascot.id} locked={!mascot.unlocked} size={40} decorative />
                  {!mascot.unlocked && (
                    <Lock
                      size={10}
                      strokeWidth={2.6}
                      className="absolute -right-0.75 -bottom-0.75 size-4.5 rounded-full border border-border bg-muted p-1 text-muted-foreground"
                    />
                  )}
                </span>
                <span
                  aria-hidden={!mascot.unlocked}
                  className={cn(
                    "text-[11px]",
                    mascot.selected
                      ? "font-bold text-primary"
                      : mascot.unlocked
                        ? "font-medium text-muted-foreground"
                        : "text-text-disabled",
                  )}
                >
                  {name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
