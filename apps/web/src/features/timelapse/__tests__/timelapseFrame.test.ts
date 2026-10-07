import { describe, expect, it } from "vitest";

import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import type { TimelapseRecord } from "../timelapseStore";
import {
  FLOW_COLORS,
  canvasSizeFor,
  drawTimelapseFrame,
  flowSegmentsFor,
  overlayTextFor,
  type TimelapseScene,
} from "../timelapseFrame";

type Call =
  | { op: "fillText"; text: string; align: CanvasTextAlign; x: number }
  | { op: "fillRect"; fill: string; x: number; y: number; w: number; h: number }
  | { op: "drawImage"; args: number[] }
  | { op: "fill"; fill: string };

/** 그린 내용만 남기는 가짜 2D 컨텍스트 */
function recordingContext() {
  const calls: Call[] = [];
  const state = {
    fillStyle: "#000" as string | CanvasGradient | CanvasPattern,
    font: "10px sans-serif",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  const ctx = {
    ...state,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    clip() {},
    fill() {
      calls.push({ op: "fill", fill: String(ctx.fillStyle) });
    },
    rect() {},
    roundRect() {},
    clearRect() {},
    measureText(text: string) {
      return { width: text.length * 5 } as TextMetrics;
    },
    fillText(text: string, x: number) {
      calls.push({ op: "fillText", text, align: ctx.textAlign, x });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: "fillRect", fill: String(ctx.fillStyle), x, y, w, h });
    },
    drawImage(_image: unknown, ...args: number[]) {
      calls.push({ op: "drawImage", args });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const NONE = DEFAULT_TIMELAPSE_SETTINGS.info;

function scene(overrides: Partial<TimelapseScene> = {}): TimelapseScene {
  return {
    ...canvasSizeFor("9:16"),
    photo: null,
    progress: 0,
    info: NONE,
    text: {
      date: "10월 5일",
      focusTime: "순공 48분",
      focusRate: "집중률 80%",
      dday: "D-108 · 2027 수능",
      streak: "5일 연속 공부 🔥",
    },
    flow: [{ startRatio: 0.5, widthRatio: 0.25, color: FLOW_COLORS.distract }],
    ...overrides,
  };
}

function texts(calls: Call[]) {
  return calls.flatMap((call) => (call.op === "fillText" ? [call] : []));
}

describe("drawTimelapseFrame", () => {
  it("켠 정보만 그리고 워터마크는 항상 그린다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene({ info: { ...NONE, date: true, focusTime: true } }));

    expect(texts(calls).map((call) => call.text)).toEqual(
      expect.arrayContaining(["10월 5일", "순공 48분", "포커스 메이커스"]),
    );
    expect(texts(calls).map((call) => call.text)).not.toContain("집중률 80%");
    expect(texts(calls).map((call) => call.text)).not.toContain("D-108 · 2027 수능");
  });

  it("워터마크는 흰 바탕 위에 그린다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene());

    expect(calls).toContainEqual({ op: "fill", fill: "#ffffff" });
  });

  it("D-Day와 연속 공부는 왼쪽 정렬, 나머지 정보는 오른쪽 정렬로 그린다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene({ info: { ...NONE, date: true, dday: true, streak: true } }));
    const byText = new Map(texts(calls).map((call) => [call.text, call]));

    expect(byText.get("D-108 · 2027 수능")?.align).toBe("left");
    expect(byText.get("5일 연속 공부 🔥")?.align).toBe("left");
    expect(byText.get("10월 5일")?.align).toBe("right");
  });

  it("D-Day나 연속 공부 값이 없으면 켜져 있어도 그리지 않는다", () => {
    const { ctx, calls } = recordingContext();
    const base = scene();

    drawTimelapseFrame(
      ctx,
      scene({
        info: { ...NONE, dday: true, streak: true },
        text: { ...base.text, dday: null, streak: null },
      }),
    );

    expect(texts(calls).map((call) => call.text)).toEqual(["포커스 메이커스"]);
  });

  it("흐름 바는 진행률만큼 채운다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene({ info: { ...NONE, flowBar: true }, progress: 0.5 }));
    const fills = calls.flatMap((call) => (call.op === "fillRect" ? [call] : []));
    const focus = fills.find((call) => call.fill === FLOW_COLORS.focus);
    const track = fills.find((call) => call.fill === FLOW_COLORS.track);

    expect(track).toBeDefined();
    expect(focus?.w).toBeCloseTo((track?.w ?? 0) / 2);
    // 절반까지만 채웠으니 0.5부터 시작하는 자동 멈춤 구간은 아직 보이지 않는다.
    expect(fills.some((call) => call.fill === FLOW_COLORS.distract)).toBe(false);
  });

  it("흐름 바 구간이 없으면 켜져 있어도 흐름 바를 그리지 않는다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene({ info: { ...NONE, flowBar: true }, progress: 1, flow: null }));

    expect(calls.some((call) => call.op === "fillRect" && call.fill === FLOW_COLORS.track)).toBe(
      false,
    );
  });

  it("글자는 웹이 선언한 Pretendard Variable로 그린다", () => {
    const { ctx } = recordingContext();

    drawTimelapseFrame(ctx, scene({}));

    expect(ctx.font).toContain('"Pretendard Variable"');
  });

  it("사진 비율이 캔버스와 같으면 사진 전체를 캔버스에 그린다", () => {
    const { ctx, calls } = recordingContext();

    drawTimelapseFrame(ctx, scene({ photo: { width: 405, height: 720 } as ImageBitmap }));

    expect(calls[0]).toEqual({ op: "drawImage", args: [0, 0, 405, 720, 0, 0, 540, 960] });
  });

  it("사진 비율이 캔버스와 다르면 늘리지 않고 가운데를 잘라 채운다", () => {
    const { ctx, calls } = recordingContext();

    // 4:3 가로 사진을 9:16 캔버스에: 높이를 다 쓰고 좌우를 잘라낸다.
    drawTimelapseFrame(ctx, scene({ photo: { width: 960, height: 720 } as ImageBitmap }));
    // 9:16 세로 사진을 16:9 캔버스에: 너비를 다 쓰고 위아래를 잘라낸다.
    drawTimelapseFrame(
      ctx,
      scene({ width: 960, height: 540, photo: { width: 405, height: 720 } as ImageBitmap }),
    );

    const draws = calls.filter((call) => call.op === "drawImage");
    expect(draws[0]!.args).toEqual([277.5, 0, 405, 720, 0, 0, 540, 960]);
    expect(draws[1]!.args[0]).toBe(0);
    expect(draws[1]!.args[2]).toBe(405);
    expect(draws[1]!.args[3]).toBeCloseTo(227.8125);
    expect(draws[1]!.args[1]).toBeCloseTo((720 - 227.8125) / 2);
  });
});

const T0 = new Date(2026, 9, 5, 21, 3).getTime();

function record(overrides: Partial<TimelapseRecord> = {}): TimelapseRecord {
  return {
    startedAtMs: T0,
    status: "ready",
    settings: DEFAULT_TIMELAPSE_SETTINGS,
    intervalMs: 10_000,
    nextSeq: 1,
    photoCount: 1,
    summary: {
      endedAtMs: T0 + 3_600_000,
      studySec: 3_600,
      focusSec: 2_880,
      events: [
        {
          status: "PAUSE",
          startedAt: new Date(T0).toISOString(),
          endedAt: new Date(T0 + 360_000).toISOString(),
        },
        {
          status: "AWAY",
          startedAt: new Date(T0 + 1_800_000).toISOString(),
          endedAt: new Date(T0 + 2_160_000).toISOString(),
        },
      ],
    },
    ...overrides,
  };
}

describe("overlayTextFor", () => {
  it("요약에서 날짜·순공·집중률을 만들고 D-Day와 연속 공부를 덧붙인다", () => {
    expect(overlayTextFor(record(), { ddayLabel: "D-3 · 기말", streakDays: 5 })).toEqual({
      date: "10월 5일",
      focusTime: "순공 48분",
      focusRate: "집중률 80%",
      dday: "D-3 · 기말",
      streak: "5일 연속 공부 🔥",
    });
  });

  it("D-Day와 연속 공부를 모르면 null로 둔다", () => {
    expect(overlayTextFor(record(), { ddayLabel: null, streakDays: null })).toMatchObject({
      dday: null,
      streak: null,
    });
  });
});

describe("flowSegmentsFor", () => {
  it("일시정지와 자동 멈춤 구간을 비율과 색으로 바꾼다", () => {
    expect(flowSegmentsFor(record())).toEqual([
      { startRatio: 0, widthRatio: expect.closeTo(0.1), color: FLOW_COLORS.pause },
      { startRatio: 0.5, widthRatio: expect.closeTo(0.1), color: FLOW_COLORS.distract },
    ]);
  });

  it("구간 기록이 없는 복구 세션은 null을 준다", () => {
    const base = record();
    expect(
      flowSegmentsFor(record({ summary: { ...base.summary!, events: undefined } })),
    ).toBeNull();
  });
});

describe("canvasSizeFor", () => {
  it("세로는 540×960, 가로는 960×540이다", () => {
    expect(canvasSizeFor("9:16")).toEqual({ width: 540, height: 960 });
    expect(canvasSizeFor("16:9")).toEqual({ width: 960, height: 540 });
  });
});
