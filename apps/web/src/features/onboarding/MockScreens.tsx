import { Lock } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * 온보딩 폰 목업 속 화면
 *
 * 앱 화면을 흉내 낸 그림이라 테마 토큰 대신 시안(캔버스 원본)의 라이트 값을 쓴다.
 * 다크 모드에서도 목업은 라이트로 남는다.
 * 실제 앱 크기(390 폭)로 그린 화면은 폰 화면 폭(312.4)에 맞춰 줄인다.
 */
const C = {
  ink: "#1f2a3d",
  sub: "#556173",
  gray: "#8b95a1",
  mute: "#b3bccb",
  primary: "#3671cf",
  white: "#ffffff",
  track: "#e8eef8",
  empty: "#eef1f6",
  math: "#21a97a",
  english: "#f5a623",
  korean: "#e5484d",
  rest: "#b9c2d0",
  roomBg: "#101419",
  tileBg: "#191f28",
  exit: "#f0555f",
  badgeFocus: "#4593fc",
  badgeDistracted: "#ff9e1b",
  badgeBg: "rgba(16, 20, 25, 0.68)",
  soft: "linear-gradient(180deg, #eef3fb 0%, #f8fafd 45%, #ffffff 100%)",
  // 히트맵 0~5단계. 이번 주 막대도 같은 단계 색을 쓴다.
  heat: ["#eef1f6", "#dbe7fb", "#b9d2f8", "#8fb5f3", "#5f91e6", "#3671cf"],
  // 카메라를 켠 참여자 타일의 배경(밝은 쪽, 어두운 쪽, 빛이 비치는 자리)
  feeds: [
    ["#3a4250", "#1a1f27", "30% 25%"],
    ["#363d49", "#171b22", "70% 20%"],
    ["#2f3641", "#15191f", "25% 30%"],
    ["#3b4049", "#1b1f26", "65% 30%"],
    ["#343b47", "#161a21", "40% 22%"],
  ],
  feedGlow: "rgba(255, 214, 160, 0.16)",
  tileFade: "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.55) 100%)",
  textShadow: "0 1px 3px rgba(0, 0, 0, 0.45)",
  glassBg: "rgba(30, 34, 44, 0.55)",
  glassShadow: "0 10px 15px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
  controlBorder: "1px solid rgba(255, 255, 255, 0.14)",
  controlBg: "rgba(255, 255, 255, 0.1)",
  cardShadow: "0 6px 22px rgba(63, 120, 218, 0.08)",
  chipShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
  segmentShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
} as const;

const APP_SCREEN_SCALE = 0.80103;

function clock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function hhmm(totalSec: number): string {
  return `${String(Math.floor(totalSec / 3600)).padStart(2, "0")}:${String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0")}`;
}

/** 1초마다 늘어나는 초. 화면이 보일 때만 마운트되므로 들어올 때마다 처음부터 흐른다. */
function useTicker(intervalMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return tick;
}

/** 원본 크기로 그린 화면을 폰 화면에 맞춰 줄이는 틀 */
function Scaled({
  width,
  height,
  scale,
  background,
  children,
}: {
  width: number;
  height: number;
  scale: number;
  background: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute top-0 left-0 origin-top-left overflow-hidden"
      style={{ width, height, transform: `scale(${scale})`, background, color: C.ink }}
    >
      {children}
    </div>
  );
}

export function TimerScreen({ away, clock: time }: { away: boolean; clock: string }) {
  const { t } = useTranslation("onboarding");
  return (
    <div className="theme-dark onboarding-timer-screen absolute top-0 left-0 h-121.25 w-55.75 origin-top-left scale-[1.4009] overflow-hidden text-white">
      <div className="absolute inset-x-0 top-10.25 flex justify-center">
        <div
          className="relative transition-[opacity,transform,filter] duration-300"
          style={{
            opacity: away ? 0.35 : 1,
            transform: `scale(${away ? 0.98 : 1})`,
            filter: `blur(${away ? 1 : 0}px)`,
          }}
        >
          <span className="inline-flex items-center rounded-full border-[1.5px] border-primary bg-background/65 px-2.5 py-1.25 text-[11px] leading-3.5 font-medium whitespace-nowrap tabular-nums">
            {t("timer.measuring")}
          </span>
          {!away && (
            <>
              <span className="absolute inset-0 animate-[onboarding-pill-echo_1.5s_ease-out_infinite] rounded-full border-[1.5px] border-primary opacity-0 motion-reduce:hidden" />
              <span className="absolute inset-0 animate-[onboarding-pill-echo_1.5s_ease-out_0.5s_infinite] rounded-full border-[1.5px] border-primary opacity-0 motion-reduce:hidden" />
            </>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 top-55.5 flex flex-col items-center">
        <span className="text-[11px] leading-3.5 font-medium tracking-[0.2px] text-white/55">
          {t("timer.label")}
        </span>
        <p
          className={cn(
            "mt-1 text-[36px] leading-10.5 font-bold tracking-[-0.4px] tabular-nums transition-colors duration-300",
            away ? "text-text-tertiary" : "text-white",
          )}
        >
          {time}
        </p>
        <span className="mt-1.75 inline-flex items-center gap-[2.5px] text-[8px] leading-2.5 font-medium tracking-[-0.1px] text-white/42">
          <Lock size={7.5} strokeWidth={2.4} aria-hidden="true" />
          {t("timer.privacy")}
        </span>
      </div>
    </div>
  );
}

const feed = (a: string, b: string, glow: string) =>
  `radial-gradient(70% 55% at ${glow}, ${C.feedGlow}, rgba(0, 0, 0, 0) 70%), linear-gradient(160deg, ${a}, ${b})`;

const BADGE_BORDER = { FOCUS: C.badgeFocus, DISTRACTED: C.badgeDistracted, OFF: C.gray } as const;

const TILES = [
  { id: "me", bg: feed(...C.feeds[0]) },
  {
    id: "minji",
    state: "FOCUS",
    sec: 5047,
    bg: feed(...C.feeds[1]),
  },
  {
    id: "hyunwoo",
    state: "DISTRACTED",
    sec: 2230,
    bg: feed(...C.feeds[2]),
  },
  {
    id: "sua",
    state: "FOCUS",
    sec: 7540,
    bg: feed(...C.feeds[3]),
  },
  { id: "jihoon", state: "OFF", sec: 3130 },
  {
    id: "junwoo",
    state: "FOCUS",
    sec: 723,
    bg: feed(...C.feeds[4]),
  },
] as const;

const GLASS: CSSProperties = {
  background: C.glassBg,
  boxShadow: C.glassShadow,
  backdropFilter: "blur(11px)",
  WebkitBackdropFilter: "blur(11px)",
};

function ControlButton({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <span
      className="flex size-13.5 items-center justify-center rounded-full"
      style={
        danger
          ? { background: C.exit }
          : {
              border: C.controlBorder,
              background: C.controlBg,
            }
      }
    >
      {children}
    </span>
  );
}

/** 3단계 소셜룸. 참여자 타일이 한 명씩 들어오고 내 순공·총 시간이 1초씩 흐른다. */
export function RoomScreen() {
  const { t } = useTranslation("onboarding");
  const sec = useTicker(1000);
  return (
    <Scaled width={390} height={848} scale={APP_SCREEN_SCALE} background={C.roomBg}>
      <div
        className="absolute top-16.25 left-4 flex flex-col items-start tabular-nums"
        style={{ textShadow: C.textShadow }}
      >
        <p style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, color: C.white }}>
          {clock(2892 + sec)}
        </p>
        <p style={{ fontSize: 12, lineHeight: "16px", fontWeight: 700, color: C.gray }}>
          <span style={{ fontWeight: 600 }}>{t("room.total")}</span> {clock(3750 + sec)}
        </p>
      </div>

      <div className="absolute top-14.75 right-2.5 flex size-11 items-center justify-center">
        <span className="flex size-8 items-center justify-center rounded-full" style={GLASS}>
          <svg aria-hidden="true" width="18" height="4" viewBox="0 0 18 4" fill="none">
            <circle cx="2" cy="2" r="2" fill="white" />
            <circle cx="9" cy="2" r="2" fill="white" />
            <circle cx="16" cy="2" r="2" fill="white" />
          </svg>
        </span>
      </div>

      <div className="absolute top-44 left-[15.5px] flex w-89.75 flex-wrap gap-1">
        {TILES.map((tile, i) => {
          const off = "state" in tile && tile.state === "OFF";
          const name = t(`tileName.${tile.id}`);
          return (
            <div
              key={tile.id}
              className="animate-[onboarding-tile-in_0.4s_cubic-bezier(0.23,1,0.32,1)_both] motion-reduce:animate-none"
              style={{ animationDelay: `${(0.18 + i * 0.08).toFixed(2)}s` }}
            >
              <div
                className="relative size-[177.5px] overflow-hidden rounded-xl"
                style={{ background: C.tileBg }}
              >
                {"bg" in tile && (
                  <>
                    <div className="absolute inset-0" style={{ background: tile.bg }} />
                    <div
                      className="absolute inset-x-0 bottom-0 h-19"
                      style={{
                        background: C.tileFade,
                      }}
                    />
                  </>
                )}
                {off && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-white/10 text-xl leading-7 font-bold text-white">
                      {name[0]}
                    </span>
                  </div>
                )}
                {"state" in tile && (
                  <span
                    className="absolute top-2.5 right-2.5 inline-flex items-center rounded-full border-[1.5px] px-3 py-1.25 text-[13px] leading-4 font-bold text-white tabular-nums backdrop-blur-[5px]"
                    style={{
                      borderColor: BADGE_BORDER[tile.state],
                      background: C.badgeBg,
                    }}
                  >
                    {hhmm(tile.sec)}
                  </span>
                )}
                <div className="absolute inset-x-3 bottom-3">
                  <p className="truncate text-[15px] leading-4.75 font-bold text-white">{name}</p>
                  <p className="mt-1 truncate text-xs leading-3.75 text-white/72">
                    {t(`tileGoal.${tile.id}`)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-8 flex justify-center">
        <div className="flex h-18.5 items-center gap-3.5 rounded-full px-2.5" style={GLASS}>
          <ControlButton>
            <svg
              aria-hidden="true"
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="6" width="13" height="12" rx="3" />
              <path d="M15.5 10.5l6-3v9l-6-3" />
            </svg>
          </ControlButton>
          <ControlButton>
            <svg
              aria-hidden="true"
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 7v14" />
              <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
          </ControlButton>
          <ControlButton>
            <svg
              aria-hidden="true"
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </ControlButton>
          <ControlButton danger>
            <svg
              aria-hidden="true"
              width="23"
              height="23"
              viewBox="0 0 19 19"
              fill="none"
              stroke="white"
              strokeWidth="1.58333"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.6875 3.5625H5.54165C5.12172 3.5625 4.71899 3.72931 4.42206 4.02625C4.12513 4.32318 3.95831 4.72591 3.95831 5.14583V13.8542C3.95831 14.2741 4.12513 14.6768 4.42206 14.9738C4.71899 15.2707 5.12172 15.4375 5.54165 15.4375H10.6875" />
              <path d="M8.3125 9.50001H15.8333M13.0625 12.2708L15.8333 9.50001L13.0625 6.72917" />
            </svg>
          </ControlButton>
        </div>
      </div>
    </Scaled>
  );
}

/** 공부 리듬 히트맵. 줄은 요일, 칸은 05시부터 다음 날 04시까지, 숫자는 0~5단계다. */
const HEAT = [
  "001233211223334555421000",
  "001232211123334555320000",
  "001233221223334555421000",
  "001232211123344555421000",
  "001222211122233443210000",
  "000123332222232333210000",
  "000012222222222232100000",
];
const WEEK_BARS = [
  { h: "64%", c: C.heat[2] },
  { h: "78%", c: C.heat[3] },
  { h: "58%", c: C.heat[2] },
  { h: "92%", c: C.heat[5] },
  { h: "46%", c: C.heat[1] },
  { h: "30%", c: C.heat[1] },
  { h: "22%", c: C.heat[0] },
];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const CARD: CSSProperties = {
  background: C.white,
  boxShadow: C.cardShadow,
};
const LATE =
  "animate-[onboarding-late_0.35s_cubic-bezier(0.23,1,0.32,1)_both] motion-reduce:animate-none";

/** 4단계 기록 탭. 히트맵 칸이 들어온 뒤 평일 저녁 8~10시가 강조되고 맥박이 퍼진다. */
export function RecordsScreen() {
  const { t } = useTranslation("onboarding");
  return (
    <Scaled width={390} height={849} scale={APP_SCREEN_SCALE} background={C.soft}>
      <div className="absolute inset-x-5 top-19 flex items-center justify-between">
        <span style={{ fontSize: 24, lineHeight: "29px", fontWeight: 800, letterSpacing: -0.48 }}>
          {t("records.title")}
        </span>
        <span
          className="flex size-10 items-center justify-center rounded-full"
          style={{ background: C.white, boxShadow: C.chipShadow }}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 18 18"
            fill="none"
            stroke={C.ink}
            strokeWidth="1.275"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.375 3H5.625C4.38236 3 3.375 4.00736 3.375 5.25V13.125C3.375 14.3676 4.38236 15.375 5.625 15.375H12.375C13.6176 15.375 14.625 14.3676 14.625 13.125V5.25C14.625 4.00736 13.6176 3 12.375 3Z" />
            <path d="M6.375 2.0625V4.3125M11.625 2.0625V4.3125M3.375 6.9375H14.625" />
            <path d="M6.75 10.875L8.25 12.375L11.25 9.15" />
          </svg>
        </span>
      </div>

      <div
        className="absolute inset-x-5 top-30.25 flex h-11 rounded-full p-1"
        style={{ background: C.track }}
      >
        <span
          className="flex flex-1 items-center justify-center"
          style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: C.sub }}
        >
          {t("records.daily")}
        </span>
        <span
          className="flex flex-1 items-center justify-center rounded-full"
          style={{
            background: C.white,
            boxShadow: C.segmentShadow,
            fontSize: 15,
            lineHeight: "20px",
            fontWeight: 600,
          }}
        >
          {t("records.weekly")}
        </span>
      </div>

      <div
        className="absolute inset-x-5 top-48.25"
        style={{ fontSize: 17, lineHeight: "21px", fontWeight: 700 }}
      >
        {t("records.rhythm")}
      </div>

      <div
        className="absolute inset-x-5 top-56 flex flex-col gap-1 rounded-xl px-4.5 pt-4.5 pb-4"
        style={CARD}
      >
        <p className={LATE} style={{ fontSize: 17, lineHeight: "24px", fontWeight: 700 }}>
          <Trans
            t={t}
            i18nKey="records.insight"
            components={{ hl: <span style={{ color: C.primary }} /> }}
          />
        </p>
        <p className={LATE} style={{ fontSize: 13, lineHeight: "18px", color: C.sub }}>
          {t("records.insightSub")}
        </p>
        <div className="flex flex-col gap-1.5 pt-3.5">
          <div className="flex items-start gap-1.5">
            <div className="flex w-3 shrink-0 flex-col gap-0.75">
              {DAYS.map((day) => (
                <span
                  key={day}
                  className="h-3.25"
                  style={{ fontSize: 10, lineHeight: "13px", color: C.gray }}
                >
                  {t(`weekday.${day}`)}
                </span>
              ))}
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col gap-0.75">
              {HEAT.map((line, r) => (
                <div key={r} className="flex gap-0.5">
                  {line.split("").map((level, c) => (
                    <span
                      key={c}
                      className="h-3.25 min-w-0 flex-1 animate-[onboarding-cell-in_0.28s_cubic-bezier(0.23,1,0.32,1)_0.1s_both] rounded-[2px] motion-reduce:animate-none"
                      style={{ background: C.heat[Number(level)] }}
                    />
                  ))}
                </div>
              ))}
              {/* 저녁 8~10시(20·21·22시 칸)를 강조한다. */}
              <div
                className="pointer-events-none absolute -top-1 -bottom-1 animate-[onboarding-highlight-in_0.35s_cubic-bezier(0.23,1,0.32,1)_0.5s_both] rounded-md border-2 motion-reduce:animate-none"
                style={{
                  left: "calc((100% + 2px) * 0.625 - 4px)",
                  width: "calc((100% + 2px) * 0.125 + 6px)",
                  borderColor: C.primary,
                }}
              >
                <div
                  className="absolute -inset-0.5 animate-[onboarding-highlight-pulse_2s_ease-out_0.85s_infinite] rounded-md border-2 opacity-0 motion-reduce:hidden"
                  style={{ borderColor: C.primary }}
                />
              </div>
            </div>
          </div>
          <div
            className="flex justify-between pl-4.5 tabular-nums"
            style={{ fontSize: 10, lineHeight: "12px", color: C.gray }}
          >
            {[5, 11, 17, 23, 4].map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
          </div>
          <div
            className="flex items-center justify-end gap-1"
            style={{ fontSize: 10, lineHeight: "12px", color: C.gray }}
          >
            <span>{t("records.less")}</span>
            {C.heat.slice(1).map((color) => (
              <span key={color} className="size-2.5 rounded-[2px]" style={{ background: color }} />
            ))}
            <span>{t("records.more")}</span>
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-5 top-124.75"
        style={{ fontSize: 17, lineHeight: "21px", fontWeight: 700 }}
      >
        {t("records.thisWeek")}
      </div>
      <div
        className="absolute inset-x-5 top-132.5 flex h-37.5 items-end justify-between rounded-xl p-4.5"
        style={CARD}
      >
        {WEEK_BARS.map((bar, i) => (
          <span key={i} className="w-6.5 rounded-md" style={{ height: bar.h, background: bar.c }} />
        ))}
      </div>
    </Scaled>
  );
}
