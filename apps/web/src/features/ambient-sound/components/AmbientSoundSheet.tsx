import { Info, X } from "lucide-react";
import { useState } from "react";
import type { RefObject } from "react";

import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AmbientSound, SoundId } from "../catalog";
import type { Mix } from "../mix";
import { soundGroups } from "./soundGroups";
import { soundIcon } from "./soundIcons";

export interface AmbientSoundSheetProps {
  open: boolean;
  /** 시트가 그려질 자리. 세션 서브트리의 요소여야 `--session-*` 변수가 풀린다. */
  container: HTMLElement | null;
  /**
   * 닫은 뒤 포커스를 돌려줄 버튼.
   *
   * Radix 는 `Sheet.Trigger` 를 쓸 때만 포커스를 되돌린다. 진입 버튼이 세션 레이어 안에
   * 따로 있어 Trigger 로 감쌀 수 없으므로, 돌려줄 자리를 직접 알려 준다. 안 넘기면 포커스가
   * body 로 빠져 키보드 사용자가 처음부터 탭을 돌아야 한다.
   */
  triggerRef: RefObject<HTMLButtonElement | null>;
  catalog: readonly AmbientSound[];
  mix: Mix;
  duckEnabled: boolean;
  /** 자동 재생 정책에 막혀 소리가 못 난 상태. 슬라이더를 움직이면 컨텍스트가 다시 살아난다. */
  blocked: boolean;
  onToggleSound: (id: SoundId) => void;
  onChangeLevel: (id: SoundId, level: number) => void;
  onSetDuckEnabled: (enabled: boolean) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 배경음 조절 사이드 시트
 *
 * 포털은 반드시 세션 서브트리 안으로 보낸다. `--session-*` 변수가 `main` 에만 주입돼
 * `document.body` 로 나가면 색이 통째로 빠지기 때문이다. 포커스 트랩, Escape, 바깥 탭
 * 닫기는 Radix 가 맡아 손으로 만들지 않는다. `aria-modal` 은 Radix 가 만들어 주지 않아
 * 공용 `ui/sheet.tsx` 가 직접 단다.
 *
 * 카메라 위에 뜨므로 라이트·다크 테마를 따르지 않고 항상 `--session-*` 를 읽는다. 딤도
 * 마찬가지라 전역 `--dim` 이 아니라 `--session-dim` 으로 덮어쓴다.
 *
 * 소리 이름은 아이콘과 글자를 나란히 놓고, 그 줄 전체가 켜고 끄는 버튼이다. 켜진 소리는
 * 집중 색으로 물든다. 목록은 탭으로 나뉘며 그 기준은 `soundGroups.ts` 에 있다.
 */
export function AmbientSoundSheet({
  open,
  container,
  triggerRef,
  catalog,
  mix,
  duckEnabled,
  blocked,
  onToggleSound,
  onChangeLevel,
  onSetDuckEnabled,
  onOpenChange,
}: AmbientSoundSheetProps) {
  // 툴팁을 직접 제어한다. Radix 기본은 hover·focus 라 터치 기기에서는 열리지 않는다.
  const [tipOpen, setTipOpen] = useState(false);
  const groups = soundGroups(catalog);
  const [tab, setTab] = useState<string | undefined>(undefined);
  const activeTab = tab ?? groups[0]?.id;

  /**
   * 여는 요청은 무시하고 닫는 요청만 받는다.
   *
   * 시트가 열릴 때 Radix 가 첫 포커스를 이 버튼에 주는데, 툴팁은 포커스에도 열린다. 그대로
   * 두면 시트를 열자마자 툴팁이 떠 있고, 그 상태에서 누른 Escape 가 시트가 아니라 툴팁을
   * 닫아 아무 일도 없는 것처럼 보인다. 여는 것은 탭·클릭만 맡는다.
   */
  const handleTipOpenChange = (next: boolean) => {
    if (!next) setTipOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        container={container}
        // 딤도 세션 값을 써야 한다. shadcn 기본 `--dim` 은 라이트 테마에서 40% 라
        // 카메라 위에서 뒤가 비친다.
        overlayClassName="bg-[var(--session-dim)]"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        // 폭에 오른쪽 안전영역을 더한다. 시트가 화면 끝에 붙어 있어 그 인셋이 그대로 안쪽
        // 여백으로 들어가는데, 폭을 그만큼 늘리지 않으면 가로에서 내용이 204px 까지 좁아진다.
        // 위아래는 각자의 인셋을 쓴다. `py` 하나로 묶으면 아래쪽에도 위쪽 인셋이 들어가
        // 가로에서 바닥에 쓰지도 않는 24px 이 남는다.
        // `touch-manipulation` — iOS 웹뷰는 `user-scalable=no` 여도 더블탭 줌 인식기를 계속
        // 돌려서, 빠른 연속 탭의 두 번째 탭이 더블탭 후보로 잡혀 통째로 삼켜진다. 탭이 씹혀
        // 여러 번 눌러야 하는 증상이 그것이다(온보딩 화면이 같은 것을 겪었다).
        // `manipulation` 은 그 인식만 끄고 팬·핀치는 그대로 둔다 — 소리 목록의 세로 스크롤은
        // 영향을 받지 않는다. `index.css` 가 경고하는 것은 `none` 이야기라 해당 없다.
        className="flex touch-manipulation w-[calc(300px+env(safe-area-inset-right))] max-w-[85%] flex-col gap-1 rounded-l-xl border-0 bg-[var(--session-dialog-bg)] pt-[calc(env(safe-area-inset-top)+20px)] pr-[calc(env(safe-area-inset-right)+24px)] pb-[calc(env(safe-area-inset-bottom)+20px)] pl-6 text-[var(--session-dialog-body)] shadow-[-20px_0_50px_0_rgba(0,0,0,0.45)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-[18px] leading-[21px] font-bold text-[var(--session-dialog-title)]">
              배경음
            </SheetTitle>
            <TooltipProvider>
              <Tooltip open={tipOpen} onOpenChange={handleTipOpenChange}>
                <TooltipTrigger
                  aria-label="배경음 안내"
                  onClick={() => setTipOpen((open) => !open)}
                  className="relative flex size-4 items-center justify-center rounded-full text-[var(--session-dialog-body)] after:absolute after:-inset-3.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none"
                >
                  <Info size={16} aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                  일시정지 중에는 배경음이 들리지 않아요
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <SheetClose
            aria-label="닫기"
            // `rounded-full` 은 히트 영역까지 원으로 깎는다 — 44px 사각형의 네 모서리를
            // 눌러도 버튼이 아니라 뒤가 잡힌다. 실제로 그래서 잘 안 눌렸다. 둥근 모양은
            // 그대로 두고, 반경 없는 `after` 로 52px 사각형 탭 영역을 덧댄다.
            className="relative -mr-2.5 flex size-11 items-center justify-center rounded-full text-[var(--session-dialog-body)] transition-opacity duration-200 after:absolute after:-inset-1 after:content-[''] active:opacity-70 focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <X size={20} aria-hidden="true" />
          </SheetClose>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <TabsList className="shrink-0">
            {groups.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="flex-1 justify-center text-white/40 data-[state=active]:border-[var(--state-focus)] data-[state=active]:text-[var(--session-dialog-title)]"
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
              className="mt-0 min-h-0 flex-1 overflow-y-auto pr-2"
            >
              <ul className="flex flex-col">
                {group.sounds.map((sound) => {
                  const level = mix[sound.id] ?? 0;
                  const on = sound.id in mix;
                  const Icon = soundIcon(sound.id);
                  return (
                    <li key={sound.id} className="flex flex-col">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onToggleSound(sound.id)}
                        className={cn(
                          "flex min-h-11 items-center gap-2.5 text-left text-[15px] leading-[22px]",
                          "transition-colors duration-200 active:opacity-80 motion-reduce:transition-none",
                          "focus-visible:ring-2 focus-visible:ring-[color:var(--state-focus)] focus-visible:outline-none",
                          on ? "text-[var(--state-focus)]" : "text-[var(--session-dialog-title)]",
                        )}
                      >
                        <Icon size={20} aria-hidden="true" className="shrink-0" />
                        {sound.label}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={level}
                        aria-label={`${sound.label} 음량`}
                        onChange={(event) => onChangeLevel(sound.id, Number(event.target.value))}
                        className="-mt-2 min-h-11 w-full accent-[var(--state-focus)]"
                      />
                    </li>
                  );
                })}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
        {catalog.length === 0 && (
          <p className="shrink-0 text-[13px] leading-5">배경음 목록을 불러오지 못했어요</p>
        )}
        {blocked && (
          <p className="shrink-0 text-[13px] leading-5">
            자동 재생이 막혀 있어요. 음량을 0 으로 내렸다 다시 올리면 들려요
          </p>
        )}

        <div className="flex min-h-11 shrink-0 items-center justify-between gap-3">
          <span className="flex flex-col text-[15px] leading-[22px] text-[var(--session-dialog-title)]">
            집중 연동
            <span className="text-[13px] leading-5 text-[var(--session-dialog-body)]">
              집중 상태가 아닐 때는 소리를 낮춰요
            </span>
          </span>
          <Switch checked={duckEnabled} onCheckedChange={onSetDuckEnabled} aria-label="집중 연동" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
