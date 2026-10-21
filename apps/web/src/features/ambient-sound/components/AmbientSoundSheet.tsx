import { useId, useState } from "react";
import type { ReactNode } from "react";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionPage, SessionPageFooter } from "@/features/study-session/components/SessionPage";
import { cn } from "@/lib/utils";

import type { AmbientSound, SoundId } from "../catalog";
import type { Mix } from "../mix";
import { soundGroups } from "./soundGroups";
import { soundIcon } from "./soundIcons";
import { soundNote } from "./soundNotes";

export interface AmbientSoundSheetProps {
  open: boolean;
  /** 페이지가 그려질 자리. 세션 서브트리의 요소여야 `--session-*` 변수가 풀린다. */
  container: HTMLElement | null;
  /**
   * 닫은 뒤 포커스를 돌려줄 요소.
   *
   * 진입 버튼이 세션 레이어 안에 따로 있어 Trigger 로 감쌀 수 없으므로, 돌려줄 자리를 직접 알려 준다.
   * 안 넘기면 포커스가 body 로 빠져 키보드 사용자가 처음부터 탭을 돌아야 한다.
   */
  returnFocus: () => HTMLElement | null;
  landscape: boolean;
  /** 페이지 아래 순공 타이머. */
  timer: ReactNode;
  catalog: readonly AmbientSound[];
  mix: Mix;
  duckEnabled: boolean;
  /** 자동 재생 정책에 막혀 소리가 못 난 상태. 슬라이더를 움직이면 컨텍스트가 다시 살아난다. */
  blocked: boolean;
  canRestore: boolean;
  onToggleSound: (id: SoundId) => void;
  onChangeLevel: (id: SoundId, level: number) => void;
  onSetDuckEnabled: (enabled: boolean) => void;
  onToggleAll: () => void;
  onOpenChange: (open: boolean) => void;
}

/** `InfoTooltip` 기본색은 전역 토큰이라 세션 툴팁 색으로 덮는다. */
const SESSION_TOOLTIP_CLASS = "bg-(--session-dialog-cancel-bg) text-white";

/** 소리 이름 줄. 아이콘과 글자를 나란히 놓고 그 칸 전체가 켜고 끄는 버튼이다. */
function SoundRow({
  sound,
  icon,
  level,
  on,
  landscape,
  onToggle,
  onChangeLevel,
}: {
  sound: AmbientSound;
  icon: ReactNode;
  level: number;
  on: boolean;
  landscape: boolean;
  onToggle: () => void;
  onChangeLevel: (level: number) => void;
}) {
  const note = soundNote(sound.id);
  // 켜고 끄는 버튼은 글자 폭만 차지하고, 가상 요소로 이름 칸 전체를 눌리게 넓힌다.
  // 그래야 안내 ⓘ를 글자 바로 뒤에 붙여도 줄 전체가 버튼인 채로 남는다.
  const name = (
    <div
      className={cn(
        "relative flex min-h-11 items-center",
        landscape ? "w-32.5 shrink-0 regular:w-37.5" : "min-w-0 flex-1",
      )}
    >
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn(
          "flex min-h-11 min-w-0 items-center gap-2.5 text-left text-[15px] leading-5.5 after:absolute after:inset-0 after:content-['']",
          "transition-colors duration-200 active:opacity-80 motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
          on ? "text-(--state-focus)" : "text-(--session-dialog-title)",
        )}
      >
        {icon}
        <span className="truncate">{sound.label}</span>
      </button>
      {note && (
        // 오른쪽 여백을 아이콘 폭만큼 되돌려 ⓘ가 이름 칸을 넓히거나 글자를 줄이지 않게 한다.
        <span className="ml-1 -mr-4 flex shrink-0">
          <InfoTooltip
            label={`${sound.label} 안내`}
            side="top"
            contentClassName={SESSION_TOOLTIP_CLASS}
          >
            {note}
          </InfoTooltip>
        </span>
      )}
    </div>
  );
  // 슬라이더가 이름 칸의 넓힌 터치 영역보다 위에 그려져야 끝자락을 잡아도 슬라이더가 움직인다.
  const slider = (
    <input
      type="range"
      min={0}
      max={100}
      value={level}
      aria-label={`${sound.label} 음량`}
      onChange={(event) => onChangeLevel(Number(event.target.value))}
      className={cn(
        "relative min-h-11 accent-(--state-focus)",
        landscape ? "min-w-0 flex-1" : "-mt-2 w-full",
      )}
    />
  );

  if (landscape) {
    return (
      <li className="flex min-h-11 items-center gap-2.5 regular:min-h-12">
        {name}
        {slider}
      </li>
    );
  }
  return (
    <li className="flex flex-col">
      {name}
      {slider}
    </li>
  );
}

/**
 * 배경음 조절 페이지
 *
 * 포털은 반드시 세션 서브트리 안으로 보낸다.
 * `--session-*` 변수가 `main` 에만 주입돼 `document.body` 로 나가면 색이 통째로 빠지기 때문이다.
 * 카메라 위에 뜨므로 라이트·다크 테마를 따르지 않고 항상 `--session-*` 를 읽는다.
 * 켜진 소리는 집중 색으로 물든다.
 * 세로는 목록을 탭으로 나누고, 가로는 폭이 남아 탭 없이 묶음을 나란히 둔다.
 * 묶는 기준은 `soundGroups.ts` 에 있다.
 */
export function AmbientSoundSheet({
  open,
  container,
  returnFocus,
  landscape,
  timer,
  catalog,
  mix,
  duckEnabled,
  blocked,
  canRestore,
  onToggleSound,
  onChangeLevel,
  onSetDuckEnabled,
  onToggleAll,
  onOpenChange,
}: AmbientSoundSheetProps) {
  const groups = soundGroups(catalog);
  const [tab, setTab] = useState<string | undefined>(undefined);
  const activeTab = tab ?? groups[0]?.id;
  const allOn = Object.keys(mix).length > 0;
  const groupTitleId = useId();

  const rows = (sounds: readonly AmbientSound[]) => (
    <ul className={cn("flex flex-col", landscape && "gap-0.75 regular:gap-1")}>
      {sounds.map((sound) => {
        const Icon = soundIcon(sound.id);
        return (
          <SoundRow
            key={sound.id}
            sound={sound}
            icon={<Icon size={20} aria-hidden="true" className="shrink-0" />}
            level={mix[sound.id] ?? 0}
            on={sound.id in mix}
            landscape={landscape}
            onToggle={() => onToggleSound(sound.id)}
            onChangeLevel={(level) => onChangeLevel(sound.id, level)}
          />
        );
      })}
    </ul>
  );

  const duckRow = (
    <div className="flex min-h-11 items-center gap-5.5">
      <span className="flex items-center gap-1 text-[15px] leading-5.5 text-(--session-dialog-title)">
        집중 연동
        <InfoTooltip label="집중 연동 안내" side="top" contentClassName={SESSION_TOOLTIP_CLASS}>
          집중 상태가 아닐 때는 소리를 낮춰요
        </InfoTooltip>
      </span>
      <Switch checked={duckEnabled} onCheckedChange={onSetDuckEnabled} aria-label="집중 연동" />
    </div>
  );

  return (
    <SessionPage
      open={open}
      onOpenChange={onOpenChange}
      container={container}
      returnFocus={returnFocus}
      title="배경음"
      landscape={landscape}
      headerExtras={
        // 글자와 ⓘ는 4px만 띄운다. ⓘ의 44px 터치 영역은 가상 요소라 간격을 밀지 않는다.
        // ⓘ와 스위치 사이는 두 터치 영역이 겹치지 않게 넓게 둔다.
        <div className="ml-1 flex items-center gap-5.5">
          <InfoTooltip label="배경음 안내" contentClassName={SESSION_TOOLTIP_CLASS}>
            일시정지 중에는 배경음이 들리지 않아요
          </InfoTooltip>
          <Switch
            checked={allOn}
            onCheckedChange={onToggleAll}
            disabled={!allOn && !canRestore}
            aria-label="배경음"
          />
        </div>
      }
    >
      {landscape ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-6 overflow-y-auto overscroll-contain regular:gap-10">
          {groups.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-labelledby={`${groupTitleId}-${group.id}`}
              className="flex min-w-0 flex-col gap-0.75 regular:gap-1"
            >
              <p
                id={`${groupTitleId}-${group.id}`}
                className="text-[13px] leading-5 text-(--session-dialog-body)"
              >
                {group.label}
              </p>
              {rows(group.sounds)}
            </div>
          ))}
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col gap-4 px-6 pt-2"
        >
          <TabsList className="shrink-0">
            {groups.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="flex-1 justify-center text-white/40 data-[state=active]:border-(--state-focus) data-[state=active]:text-(--session-dialog-title)"
              >
                {group.label}
                <span className="text-[13px] tabular-nums opacity-60">{group.sounds.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((group) => (
            <TabsContent
              key={group.id}
              value={group.id}
              className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
            >
              {rows(group.sounds)}
            </TabsContent>
          ))}
        </Tabs>
      )}
      {catalog.length === 0 && (
        <p
          className={cn(
            "shrink-0 text-[13px] leading-5 text-(--session-dialog-body)",
            !landscape && "px-6",
          )}
        >
          배경음 목록을 불러오지 못했어요
        </p>
      )}
      {blocked && (
        <p
          className={cn(
            "shrink-0 text-[13px] leading-5 text-(--session-dialog-body)",
            !landscape && "px-6",
          )}
        >
          자동 재생이 막혀 있어요. 음량을 0 으로 내렸다 다시 올리면 들려요
        </p>
      )}

      <SessionPageFooter landscape={landscape} leading={duckRow} timer={timer} />
    </SessionPage>
  );
}
