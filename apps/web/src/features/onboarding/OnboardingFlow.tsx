import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import iphoneFrame from "@/assets/onboarding/iphone-frame.webp";
import screenHome from "@/assets/onboarding/screen-home.webp";
import type { OnboardingStep } from "@/lib/amplitude";
import { cn } from "@/lib/utils";

import { CONFETTI } from "./confetti";
import { PlannerScreen, RecordsScreen, RoomScreen, TimerScreen } from "./MockScreens";
import { useStageBox } from "./useStageBox";

/** 1~4는 소개 단계, 5는 준비 완료다. */
type Scene = 1 | 2 | 3 | 4 | 5;

const STEP_OF: Record<Scene, OnboardingStep> = {
  1: "auto_timer",
  2: "auto_record",
  3: "group_study",
  4: "notification",
  5: "ready",
};

const TITLES: Record<Scene, [string, string]> = {
  1: ["카메라만 켜 두면", "순공 시간을 자동으로 측정해요"],
  2: ["공부하는 동안", "플래너에 자동으로 기록돼요"],
  3: ["친구를 초대해 6명까지", "함께 집중할 수 있어요"],
  4: ["집중이 잘 되는 시간에", "맞춤 알림을 보내줄게요"],
  5: ["준비가 끝났어요", "이제 함께 집중해 볼까요"],
};

const MOCK_LABELS: Record<Scene, string> = {
  1: "카메라를 켜 두면 순공 타이머가 흐르고, 집중하지 않으면 멈추는 화면",
  2: "플래너 타임테이블에 순공이 칸 단위로 채워지는 화면",
  3: "참여자 6명이 함께 공부하는 소셜룸 화면",
  4: "기록 탭의 공부 리듬에서 평일 저녁 8~10시가 강조되고 맞춤 알림이 내려오는 화면",
  5: "홈 화면에서 집중 시작을 누르는 모습",
};

/**
 * 단계별 폰 자리
 *
 * 같은 폰 하나를 단계마다 옮기고 키워서 화면이 바뀌어도 폰이 이어져 보이게 한다.
 * `clip`은 보이는 높이이고 `fade`는 아래 끝이 흐려지는 길이다(시안 390×844 좌표).
 */
const GEO: Record<Scene, { x: number; y: number; scale: number; clip: number; fade: number }> = {
  1: { x: 50, y: 142.04, scale: 0.828571, clip: 607.4, fade: 153.3 },
  2: { x: 50, y: 142.04, scale: 0.828571, clip: 607.4, fade: 153.3 },
  3: { x: 70, y: 85, scale: 0.714286, clip: 900, fade: 69 },
  4: { x: 20, y: 206, scale: 1, clip: 550, fade: 69 },
  5: { x: 72.5, y: 214, scale: 0.7, clip: 900, fade: 69 },
};

/** 실제 앱 크기(390 폭)로 그린 화면을 폰 화면 폭(312.4)에 맞추는 배율 */
const APP_SCREEN_SCALE = 0.80103;

/** 이전 화면은 새 화면이 다 들어온 뒤 내린다(화면 전환 620ms보다 조금 길게). */
const PREV_SCREEN_HOLD_MS = 660;

const DISTRACTION_PILLS = [
  { label: "자리를 비운 것 같아요", style: { left: -28, top: -9 }, delay: "0s" },
  { label: "기기를 조작 중인 것 같아요", style: { right: -28, top: 91 }, delay: "0.04s" },
  { label: "휴대폰을 사용 중인 것 같아요", style: { left: -28, top: 131 }, delay: "0.08s" },
  { label: "졸고 있는 것 같아요", style: { right: -28, top: 173 }, delay: "0.12s" },
] as const;

const SCREEN_IN = "animate-[onboarding-screen-in_0.62s_cubic-bezier(0.23,1,0.32,1)_both]";
const SCREEN_OUT = "animate-[onboarding-screen-out_0.62s_cubic-bezier(0.4,0,0.2,1)_both]";

const isAway = (tick: number) => tick % 4 >= 2;

function clock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * 1단계 타이머 흉내
 *
 * 0.7초마다 한 칸, 4칸 주기로 집중과 비집중이 바뀐다.
 * 비집중으로 측정되면 시간이 멈추고 회색이 되며, 폰 밖 감지 필이 켜진다.
 */
function useMockTimer(running: boolean) {
  const [state, setState] = useState({ tick: 0, focusSec: 1477 });
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () =>
        setState((s) => {
          const tick = s.tick + 1;
          return { tick, focusSec: isAway(tick) ? s.focusSec : s.focusSec + 1 };
        }),
      700,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  return { away: isAway(state.tick), clock: clock(state.focusSec) };
}

/** 실제 앱 크기(390 폭)로 내보낸 화면 그림. 위에 얹는 모션도 같은 좌표로 그린다. */
function AppScreen({ src, children }: { src: string; children?: ReactNode }) {
  return (
    <div
      className="absolute top-0 left-0 h-212.25 w-97.5 origin-top-left"
      style={{ transform: `scale(${APP_SCREEN_SCALE})` }}
    >
      <img src={src} alt="" className="block h-full w-full" draggable={false} />
      {children}
    </div>
  );
}

function HomeScreen() {
  return (
    <AppScreen src={screenHome}>
      <span className="onboarding-press-ring absolute top-133 left-5 h-14 w-87.5 animate-[onboarding-press-ring_2.6s_cubic-bezier(0.23,1,0.32,1)_0.9s_infinite] rounded-2xl opacity-0 motion-reduce:hidden" />
      <span className="absolute top-133 left-5 flex h-14 w-87.5 animate-[onboarding-home-press_2.6s_cubic-bezier(0.4,0,0.2,1)_0.9s_infinite] items-center justify-center rounded-2xl bg-[#3671cf] text-[18px] leading-5.25 font-bold tracking-[0.9px] text-white shadow-sb-cta motion-reduce:animate-none">
        집중 시작
      </span>
      <span className="onboarding-tap-ripple absolute top-133.5 left-61.75 size-13 animate-[onboarding-tap-ripple_2.6s_cubic-bezier(0.23,1,0.32,1)_0.9s_infinite] rounded-full opacity-0 motion-reduce:hidden" />
      <span className="onboarding-tap-dot absolute top-133.5 left-61.75 size-13 animate-[onboarding-tap-dot_2.6s_cubic-bezier(0.4,0,0.2,1)_0.9s_infinite] rounded-full opacity-0 motion-reduce:hidden" />
    </AppScreen>
  );
}

function SceneScreen({ scene, away, clock }: { scene: Scene; away: boolean; clock: string }) {
  switch (scene) {
    case 1:
      return <TimerScreen away={away} clock={clock} />;
    case 2:
      return <PlannerScreen />;
    case 3:
      return <RoomScreen />;
    case 4:
      return <RecordsScreen />;
    case 5:
      return <HomeScreen />;
  }
}

function DistractionPills({ away, leaving }: { away: boolean; leaving: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "theme-dark pointer-events-none absolute top-0 left-0 h-127.75 w-62.5 origin-top-left scale-[1.4]",
        leaving
          ? "opacity-0 transition-[opacity,filter] duration-300 filter-[blur(6px)]"
          : "animate-[onboarding-pill-in_0.6s_cubic-bezier(0.23,1,0.32,1)_0.12s_both] motion-reduce:animate-none",
      )}
    >
      {DISTRACTION_PILLS.map((pill) => (
        <span
          key={pill.label}
          className="onboarding-pill absolute inline-flex items-center rounded-full border-[1.5px] border-state-distract px-3 py-1.5 text-xs leading-4 font-medium whitespace-nowrap text-white transition-[opacity,transform] duration-300 motion-reduce:transition-opacity"
          style={{
            ...pill.style,
            opacity: away ? 1 : 0.22,
            transform: `scale(${away ? 1 : 0.98})`,
            transitionDelay: pill.delay,
          }}
        >
          {pill.label}
        </span>
      ))}
    </div>
  );
}

function NotificationBanner({ hidden }: { hidden: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-3 transition-[opacity,filter] duration-400"
      style={{ opacity: hidden ? 0 : 1, filter: `blur(${hidden ? 8 : 0}px)` }}
    >
      <div className="onboarding-notif absolute top-13 -left-1 flex w-89.5 animate-[onboarding-notif-in_0.6s_cubic-bezier(0.23,1,0.32,1)_1s_both] items-center gap-3 rounded-[28px] px-4 py-3.75 motion-reduce:animate-none">
        <img src="/app-icon.png" alt="" className="size-11.5 shrink-0 rounded-[11px]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[16.5px] leading-5.5 font-semibold tracking-[-0.3px]">
              저녁 8시, 공부할 시간이에요
            </span>
            <span className="onboarding-notif-time shrink-0 text-sm leading-4.5">지금</span>
          </span>
          <span className="text-base leading-5.5 tracking-[-0.3px] break-keep">
            평일 이 시간에 가장 오래 집중했어요
          </span>
        </span>
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-4 overflow-hidden motion-reduce:hidden"
    >
      {CONFETTI.map((piece, i) => (
        <span
          key={i}
          className="absolute animate-[onboarding-confetti_1.8s_both] opacity-0"
          style={
            {
              left: piece.x,
              top: 712,
              width: piece.w,
              height: piece.h,
              borderRadius: piece.radius,
              background: piece.color,
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--fall": `${piece.fall}px`,
              "--rot": `${piece.rot}deg`,
              animationDuration: `${piece.duration}s`,
              animationDelay: `${piece.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * 첫 실행 온보딩 4단계와 준비 완료
 *
 * 시안(390×844)을 그대로 옮긴 무대를 화면에 맞게 키우거나 줄여 그린다.
 * 폰 목업 하나를 단계마다 옮기고 화면만 바꿔서, 폰이 끊기지 않고 이어지는 전환을 만든다.
 * 4단계 `알림 받기`는 권한 요청이 끝난 뒤 준비 완료로 넘어간다.
 */
export function OnboardingFlow({
  onStepView,
  onAskNotification,
  onFinish,
}: {
  onStepView: (step: OnboardingStep) => void;
  onAskNotification: () => Promise<void>;
  onFinish: () => void;
}) {
  const [scene, setScene] = useState<Scene>(1);
  const [prevScene, setPrevScene] = useState<Scene | null>(null);
  const askingRef = useRef(false);
  const swapTimer = useRef<number | undefined>(undefined);
  const stage = useStageBox();
  const { away, clock } = useMockTimer(scene === 1);

  useEffect(() => {
    onStepView(STEP_OF[scene]);
  }, [scene, onStepView]);

  useEffect(() => () => window.clearTimeout(swapTimer.current), []);

  const go = (next: Scene) => {
    window.clearTimeout(swapTimer.current);
    setPrevScene(scene);
    setScene(next);
    swapTimer.current = window.setTimeout(() => setPrevScene(null), PREV_SCREEN_HOLD_MS);
  };

  const handleCta = async () => {
    if (scene < 4) {
      go((scene + 1) as Scene);
      return;
    }
    if (scene === 5) {
      onFinish();
      return;
    }
    if (askingRef.current) return;
    askingRef.current = true;
    try {
      await onAskNotification();
    } finally {
      askingRef.current = false;
    }
    go(5);
  };

  const geo = GEO[scene];
  const primaryCta = scene >= 4;
  const ctaLabel = scene < 4 ? "다음" : scene === 4 ? "알림 받기" : "시작하기";
  const screens = ([1, 2, 3, 4, 5] as const).filter((s) => s === scene || s === prevScene);

  return (
    <div className="theme-soft-blue bg-soft-blue fixed inset-0 overflow-hidden text-foreground">
      <div
        className="absolute h-211 w-97.5 origin-top-left"
        style={{ left: stage.left, top: stage.top, transform: `scale(${stage.scale})` }}
      >
        <button
          type="button"
          aria-label="이전"
          aria-hidden={scene === 1}
          inert={scene === 1}
          onClick={() => go((scene - 1) as Scene)}
          className={cn(
            "absolute top-13.5 left-5 z-5 flex size-11 items-center justify-center transition-opacity duration-250",
            scene === 1 && "opacity-0",
          )}
        >
          <ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <div
          className="onboarding-phone absolute top-0 left-0 h-179 w-87.5 origin-top-left"
          style={{ transform: `translate(${geo.x}px, ${geo.y}px) scale(${geo.scale})` }}
        >
          <div
            role="img"
            aria-label={MOCK_LABELS[scene]}
            className="relative h-179 w-87.5 animate-[onboarding-screen-in_0.5s_cubic-bezier(0.23,1,0.32,1)_both]"
          >
            <div
              className="onboarding-clip absolute -top-15 -left-20 w-127.5 overflow-hidden"
              style={{ height: geo.clip, "--onboarding-fade": `${geo.fade}px` } as CSSProperties}
            >
              <div className="absolute top-15 left-20 h-179 w-87.5 drop-shadow-[0_22px_38px_rgba(31,42,61,0.2)]">
                <div className="absolute top-[17.9px] left-[18.7px] isolate h-170 w-[312.4px] overflow-hidden rounded-[42px] bg-[#1a2029]">
                  {screens.map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "absolute inset-0 motion-reduce:animate-none",
                        s === scene ? cn("z-2", SCREEN_IN) : cn("z-1", SCREEN_OUT),
                      )}
                    >
                      <SceneScreen scene={s} away={away} clock={clock} />
                    </div>
                  ))}
                </div>
                <img
                  src={iphoneFrame}
                  alt=""
                  className="absolute inset-0 h-full w-full"
                  draggable={false}
                />
              </div>
            </div>
          </div>
          {(scene === 4 || (scene === 5 && prevScene === 4)) && (
            <NotificationBanner hidden={scene === 5} />
          )}
          {(scene === 1 || prevScene === 1) && (
            <DistractionPills away={away} leaving={scene !== 1} />
          )}
        </div>

        {([1, 2, 3, 4, 5] as const).map((s) => {
          const active = s === scene;
          const offset = active ? 0 : s < scene ? -10 : 10;
          return (
            <h1
              key={s}
              aria-hidden={!active}
              className="onboarding-title pointer-events-none absolute inset-x-5 text-center text-[22px] leading-7.5 font-bold tracking-[-0.2px]"
              style={{
                top: s >= 4 ? 122 : 622,
                opacity: active ? 1 : 0,
                transform: `translateY(${offset}px)`,
                filter: `blur(${active ? 0 : 6}px)`,
                transitionDelay: active ? "0.12s" : "0s",
              }}
            >
              {TITLES[s][0]}
              <br />
              {TITLES[s][1]}
            </h1>
          );
        })}

        {scene === 5 && <Confetti />}

        <button
          type="button"
          onClick={() => void handleCta()}
          className={cn(
            "onboarding-cta absolute inset-x-5 bottom-11.5 z-5 flex h-14 items-center justify-center rounded-xl text-base leading-6 font-semibold active:scale-[0.99]",
            primaryCta
              ? "bg-primary text-primary-foreground shadow-sb-cta"
              : "bg-brand-subtle text-primary",
          )}
        >
          {ctaLabel}
        </button>
      </div>
      {/* 제목이 바뀐 것을 화면 읽기 프로그램에 알린다. */}
      <p className="sr-only" aria-live="polite">
        {TITLES[scene].join(" ")}
      </p>
    </div>
  );
}
