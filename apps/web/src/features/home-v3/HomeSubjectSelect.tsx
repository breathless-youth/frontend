import { Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SubjectColorDot } from "@/features/study-session/components/SubjectColorDot";
import { HomeDesignIcon } from "./HomeDesignIcon";
import type { HomeLoadState, HomeSubject } from "./homeV3ContentTypes";

function SubjectDot({ colorIndex }: { colorIndex?: number }) {
  return colorIndex === undefined ? (
    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
  ) : (
    <SubjectColorDot colorIndex={colorIndex} className="size-2.5" />
  );
}

export function HomeSubjectSelect({
  subjects,
  subjectId,
  starting,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onAdd,
}: {
  subjects: HomeLoadState<readonly HomeSubject[]>;
  subjectId: number | null;
  starting: boolean;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  onSelect: (id: number | null) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation("home");
  const items = subjects.status === "success" ? subjects.value : [];
  const selected = items.find((subject) => subject.id === subjectId);
  const subjectLabel =
    selected?.name ??
    t(
      subjectId !== null && subjects.status !== "success"
        ? "v3.subject.saved"
        : "v3.subject.choose",
    );
  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="unstyled"
          disabled={subjects.status === "pending" || starting}
          className="home-v3-subject-trigger min-h-11 max-w-full justify-start gap-2.5 rounded-[14px] bg-bg-layer-2 py-0 pr-3 pl-3.5 text-sm leading-5 font-medium"
          aria-label={subjectLabel}
        >
          <SubjectDot colorIndex={selected?.colorIndex} />
          <span className="min-w-0 flex-1 truncate text-left">{subjectLabel}</span>
          <HomeDesignIcon name="subjectChevron" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="theme-soft-blue w-60 max-w-[calc(100vw-40px)] rounded-lg border-0 bg-muted p-1.5 shadow-[0_10px_28px_rgba(31,42,61,0.18)]"
      >
        {subjects.status === "error" && (
          <DropdownMenuItem onSelect={subjects.retry} className="min-h-11 px-3">
            {t("v3.subject.retry")}
          </DropdownMenuItem>
        )}
        {items.map((subject) => (
          <DropdownMenuItem
            key={subject.id}
            onSelect={() => onSelect(subject.id)}
            className="min-h-11 gap-2.5 px-3 text-[15px] leading-5"
          >
            <SubjectDot colorIndex={subject.colorIndex} />
            <span className="min-w-0 flex-1 truncate">{subject.name}</span>
            {selected?.id === subject.id && <Check size={16} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
        <Separator className="mx-2 my-1 w-auto" />
        <DropdownMenuItem
          onSelect={() => onSelect(null)}
          className="min-h-11 gap-2.5 px-3 text-[15px] leading-5 text-muted-foreground"
        >
          <SubjectDot />
          {t("v3.subject.none")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onAdd}
          className="min-h-11 gap-1 px-3 text-sm leading-5 text-primary"
        >
          <Plus size={14} aria-hidden="true" />
          {t("v3.subject.add")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
