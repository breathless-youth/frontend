import { timelineSegments } from "@/features/study-session/sessionResult";
import { toKoreanDurationLength } from "@/features/study-session/formatDuration";

import type { TimelapseAspect, TimelapseInfoKey } from "./timelapseSettings";
import type { TimelapseRecord } from "./timelapseStore";

export const TIMELAPSE_FPS = 12;

/** 영상 위에 그리는 색이라 테마와 관계없이 고정이다. */
export const FLOW_COLORS = {
  focus: "#5a90ea",
  distract: "#ff9e1b",
  pause: "#b3bccb",
  track: "rgba(255,255,255,0.25)",
} as const;

const WATERMARK_TEXT = "포커스 메이커스";
const WATERMARK_COLOR = "#3671cf";
const WATERMARK_BACKGROUND = "#ffffff";
const TEXT_COLOR = "#ffffff";
const TEXT_SHADOW = "rgba(0,0,0,0.45)";
const FONT_FAMILY = "Pretendard, system-ui, sans-serif";

/** 설정 미리보기의 짧은 변. 모든 치수는 이 길이를 기준으로 비례해 키운다. */
const BASE_SHORT_EDGE = 180;

export interface FlowSegment {
  readonly startRatio: number;
  readonly widthRatio: number;
  readonly color: string;
}

export interface TimelapseOverlayText {
  readonly date: string;
  readonly focusTime: string;
  readonly focusRate: string;
  readonly dday: string | null;
  readonly streak: string | null;
}

export interface TimelapseScene {
  readonly width: number;
  readonly height: number;
  readonly photo: CanvasImageSource | null;
  /** 0~1. 흐름 바를 이만큼 채운다. */
  readonly progress: number;
  readonly info: Readonly<Record<TimelapseInfoKey, boolean>>;
  readonly text: TimelapseOverlayText;
  /** null이면 흐름 바를 그리지 않는다. */
  readonly flow: readonly FlowSegment[] | null;
}

/** 화면 표시와 영상 파일이 함께 쓰는 캔버스 크기 */
export function canvasSizeFor(aspect: TimelapseAspect): { width: number; height: number } {
  return aspect === "9:16" ? { width: 540, height: 960 } : { width: 960, height: 540 };
}

function dateLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 오버레이 표시 문자열
 *
 * 레코드에 남은 기기 요약으로 만들어 서버 응답이 없는 다시 보기에서도 같은 값이 나온다.
 */
export function overlayTextFor(
  record: TimelapseRecord,
  extra: { ddayLabel: string | null; streakDays: number | null },
): TimelapseOverlayText {
  const studySec = record.summary?.studySec ?? 0;
  const focusSec = record.summary?.focusSec ?? 0;
  const rate = studySec > 0 ? Math.round((focusSec / studySec) * 100) : 0;
  return {
    date: dateLabel(record.startedAtMs),
    focusTime: `순공 ${toKoreanDurationLength(focusSec)}`,
    focusRate: `집중률 ${rate}%`,
    dday: extra.ddayLabel,
    streak: extra.streakDays === null ? null : `${extra.streakDays}일 연속 공부 🔥`,
  };
}

/**
 * 흐름 바 구간
 *
 * 결과 화면 타임라인과 같은 계산을 쓰고, 이벤트가 없는 바탕은 순공 색으로 그린다.
 * 앱 실행 복구로 끝난 세션은 구간 기록이 없어 null이다.
 */
export function flowSegmentsFor(record: TimelapseRecord): FlowSegment[] | null {
  const summary = record.summary;
  if (summary?.events === undefined) {
    return null;
  }
  return timelineSegments({
    startedAt: new Date(record.startedAtMs).toISOString(),
    endedAt: new Date(summary.endedAtMs).toISOString(),
    events: [...summary.events],
  }).map((segment) => ({
    startRatio: segment.startRatio,
    widthRatio: segment.widthRatio,
    color: segment.status === "PAUSE" ? FLOW_COLORS.pause : FLOW_COLORS.distract,
  }));
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  // 옛 WebKit은 roundRect가 없어 각진 사각형으로 그린다.
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}

function setTextStyle(ctx: CanvasRenderingContext2D, weight: number, size: number, unit: number) {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = TEXT_COLOR;
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 2 * unit;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0.5 * unit;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** 사진을 늘리지 않고 가운데를 잘라 캔버스를 채운다. 기기 카메라 비율이 영상 비율과 달라도 찌그러지지 않는다. */
function drawPhotoCover(
  ctx: CanvasRenderingContext2D,
  photo: CanvasImageSource,
  width: number,
  height: number,
) {
  const { width: photoWidth, height: photoHeight } = photo as { width: number; height: number };
  const scale = Math.min(photoWidth / width, photoHeight / height);
  const sw = width * scale;
  const sh = height * scale;
  ctx.drawImage(photo, (photoWidth - sw) / 2, (photoHeight - sh) / 2, sw, sh, 0, 0, width, height);
}

interface Line {
  readonly text: string;
  readonly weight: number;
  readonly size: number;
}

/**
 * 타임랩스 한 장면
 *
 * 결과 화면 재생과 공유용 영상 파일이 같은 함수를 써서 둘이 같은 그림이 된다.
 * 배치와 크기는 설정 미리보기와 같고 짧은 변에 비례해 키운다.
 * 얼굴 가림은 촬영 때 사진에 이미 입혀져 있어 여기서 그리지 않는다.
 */
export function drawTimelapseFrame(ctx: CanvasRenderingContext2D, scene: TimelapseScene): void {
  const { width, height, info, text } = scene;
  const u = Math.min(width, height) / BASE_SHORT_EDGE;
  const padX = 10 * u;

  ctx.save();
  if (scene.photo === null) {
    ctx.fillStyle = "#3b4655";
    ctx.fillRect(0, 0, width, height);
  } else {
    drawPhotoCover(ctx, scene.photo, width, height);
  }

  // 왼쪽 위 D-Day와 연속 공부
  const topLines: Line[] = [];
  if (info.dday && text.dday !== null) topLines.push({ text: text.dday, weight: 700, size: 10 });
  if (info.streak && text.streak !== null) {
    topLines.push({ text: text.streak, weight: 600, size: 7.5 });
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let topY = 12 * u;
  for (const line of topLines) {
    setTextStyle(ctx, line.weight, line.size * u, u);
    ctx.fillText(line.text, padX, topY);
    topY += (line.size * 1.2 + 1) * u;
  }

  // 오른쪽 아래 정보와 흐름 바
  let bottomY = height - 10 * u;
  if (info.flowBar && scene.flow !== null) {
    const barHeight = 4 * u;
    const barY = bottomY - barHeight;
    const barWidth = width - padX * 2;
    clearShadow(ctx);
    ctx.save();
    roundedRect(ctx, padX, barY, barWidth, barHeight, 2 * u);
    ctx.clip();
    ctx.fillStyle = FLOW_COLORS.track;
    ctx.fillRect(padX, barY, barWidth, barHeight);
    const filled = barWidth * Math.min(1, Math.max(0, scene.progress));
    if (filled > 0) {
      ctx.fillStyle = FLOW_COLORS.focus;
      ctx.fillRect(padX, barY, filled, barHeight);
      for (const segment of scene.flow) {
        const start = barWidth * segment.startRatio;
        const end = Math.min(filled, barWidth * (segment.startRatio + segment.widthRatio));
        if (end > start) {
          ctx.fillStyle = segment.color;
          ctx.fillRect(padX + start, barY, end - start, barHeight);
        }
      }
    }
    ctx.restore();
    bottomY = barY - 5 * u;
  }

  const bottomLines: Line[] = [];
  if (info.date) bottomLines.push({ text: text.date, weight: 600, size: 7.5 });
  if (info.focusTime) bottomLines.push({ text: text.focusTime, weight: 800, size: 13 });
  if (info.focusRate) bottomLines.push({ text: text.focusRate, weight: 600, size: 7.5 });
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  for (const line of [...bottomLines].reverse()) {
    setTextStyle(ctx, line.weight, line.size * u, u);
    ctx.fillText(line.text, width - padX, bottomY);
    bottomY -= (line.size * 1.2 + 1) * u;
  }

  // 오른쪽 위 워터마크는 항상 그린다.
  clearShadow(ctx);
  ctx.font = `800 ${8 * u}px ${FONT_FAMILY}`;
  const chipWidth = ctx.measureText(WATERMARK_TEXT).width + 10 * u;
  const chipHeight = (8 * 1.2 + 5) * u;
  const chipX = width - 12 * u - chipWidth;
  const chipY = 12 * u;
  ctx.fillStyle = WATERMARK_BACKGROUND;
  roundedRect(ctx, chipX, chipY, chipWidth, chipHeight, 4 * u);
  ctx.fill();
  ctx.fillStyle = WATERMARK_COLOR;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(WATERMARK_TEXT, chipX + 5 * u, chipY + chipHeight / 2);

  ctx.restore();
}
