import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const KNOWN = ["studySpace", "nature", "nightSky", "season"] as const;

/** 분류 칩. 모르는 분류는 상품이 준 값을 그대로 이름으로 쓴다. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string | null;
  onChange: (category: string | null) => void;
}) {
  const { t } = useTranslation("points-decor");
  const label = (category: string) =>
    (KNOWN as readonly string[]).includes(category)
      ? t(`categories.${category as (typeof KNOWN)[number]}`)
      : category;
  return (
    <div
      role="group"
      aria-label={t("categories.label")}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]"
    >
      <Chip selected={value === null} onClick={() => onChange(null)}>
        {t("categories.all")}
      </Chip>
      {categories.map((category) => (
        <Chip key={category} selected={value === category} onClick={() => onChange(category)}>
          {label(category)}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        selected ? "bg-foreground text-background" : "border border-border bg-muted",
      )}
    >
      {children}
    </button>
  );
}
