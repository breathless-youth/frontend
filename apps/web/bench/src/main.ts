import type { DetectionSource } from "@/features/study-session/detection";
import { DEFAULT_DETECTION_PARAMS, DETECTION_SOURCES } from "@/features/study-session/detection";
import {
  DETECTOR_SCORE_THRESHOLD,
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_CALIBRATION_DELTA,
  EYE_CALIBRATION_PERCENTILE,
  EYE_CALIBRATION_SAMPLES,
  EYE_RATIO_THRESHOLD,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_FRAME_DIVISOR,
  FRAME_INTERVAL_MS,
  HEAD_PITCH_DOWN_DEG,
  SCORE_THRESHOLDS,
} from "@/features/study-session/vision/visionConfig";

import type { BenchClass, LabelSegment } from "./labels";
import { BENCH_CLASSES, clipKey, LABEL_TEMPLATE, parseLabels } from "./labels";
import type { ClipMetrics } from "./metrics";
import { aggregateMetrics, computeClipMetrics } from "./metrics";
import type { BenchSettings, ClipRun, RunProgress } from "./runner";
import { DEFAULT_SETTINGS, runClip } from "./runner";

declare const __BENCH_COMMIT__: string;
declare const __BENCH_COMMIT_DATE__: string;

/* ------------------------------------------------------------------ *
 * 상태
 * ------------------------------------------------------------------ */

interface Clip {
  readonly id: number;
  readonly file: File;
  readonly url: string;
  readonly key: string;
  durationMs: number | null;
  labels: LabelSegment[];
  run: ClipRun | null;
  metrics: ClipMetrics | null;
  error: string | null;
  /** 결과를 낸 설정. 설정이 바뀌면 다시 돌려야 한다는 표시에 쓴다. */
  ranWith: string | null;
}

interface ScoreOptions {
  toleranceSec: number;
  graceSec: number;
}

const state = {
  clips: [] as Clip[],
  settings: structuredClone(DEFAULT_SETTINGS) as BenchSettings,
  score: { toleranceSec: 2, graceSec: 12 } as ScoreOptions,
  running: false,
  abort: null as AbortController | null,
  progress: null as (RunProgress & { clipName: string; index: number; total: number }) | null,
  pendingLabels: new Map<string, LabelSegment[]>(),
  labelErrors: [] as string[],
};
let nextId = 1;

const app = document.getElementById("app") as HTMLElement;
const liveVideoHost = document.createElement("div");

/* ------------------------------------------------------------------ *
 * 형식
 * ------------------------------------------------------------------ */

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function clock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function pct(value: number | null, digits = 1): string {
  return value === null ? "–" : `${(value * 100).toFixed(digits)}%`;
}

function secText(sec: number): string {
  return sec >= 60 ? clock(sec) : `${sec.toFixed(1)}초`;
}

const CLASS_KO: Record<BenchClass, string> = {
  FOCUS: "집중",
  AWAY: "자리 이탈",
  PHONE: "휴대폰",
  SLEEP: "졸음",
};

const SOURCE_KO: Record<DetectionSource, string> = {
  AWAY: "자리 이탈",
  PHONE: "휴대폰",
  DEVICE: "기기 조작",
  SLEEP_EYES: "눈 감김(연속)",
  SLEEP_DROWSY: "눈 감김(1분 비율)",
};

function settingsKey(): string {
  return JSON.stringify(state.settings);
}

function toast(text: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

/* ------------------------------------------------------------------ *
 * 데이터 입력
 * ------------------------------------------------------------------ */

function isLabelFile(file: File) {
  return /\.(csv|json|txt|tsv)$/i.test(file.name);
}

async function addFiles(files: FileList | File[]) {
  const list = [...files];
  for (const file of list.filter(isLabelFile)) {
    const parsed = parseLabels(await file.text());
    state.labelErrors.push(...parsed.errors.map((e) => `${file.name}: ${e}`));
    for (const [key, segments] of parsed.byClip) {
      // 파일 열이 없는 라벨 파일은 파일 이름으로 클립을 찾는다(clip01.csv → clip01).
      const target = key === "" ? clipKey(file.name) : key;
      state.pendingLabels.set(target, segments);
    }
  }
  for (const file of list.filter(
    (f) => f.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(f.name),
  )) {
    const clip: Clip = {
      id: nextId++,
      file,
      url: URL.createObjectURL(file),
      key: clipKey(file.name),
      durationMs: null,
      labels: [],
      run: null,
      metrics: null,
      error: null,
      ranWith: null,
    };
    state.clips.push(clip);
    probeDuration(clip);
  }
  attachPendingLabels();
  render();
}

function attachPendingLabels() {
  for (const clip of state.clips) {
    const segments = state.pendingLabels.get(clip.key);
    if (segments !== undefined) {
      clip.labels = segments;
      rescore(clip);
    }
  }
  if (state.clips.length === 1) {
    const loose = state.pendingLabels.get("");
    const clip = state.clips[0];
    if (loose !== undefined && clip !== undefined && clip.labels.length === 0) {
      clip.labels = loose;
      rescore(clip);
    }
  }
}

function probeDuration(clip: Clip) {
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.muted = true;
  probe.src = clip.url;
  probe.addEventListener("loadedmetadata", () => {
    clip.durationMs = Number.isFinite(probe.duration) ? Math.floor(probe.duration * 1000) : null;
    probe.removeAttribute("src");
    render();
  });
  probe.addEventListener("error", () => {
    clip.error = "이 브라우저가 영상을 열지 못했습니다. MP4(H.264)나 WebM으로 바꿔 주세요.";
    render();
  });
}

function labelsToCsv(segments: readonly LabelSegment[]): string {
  return segments
    .map((s) => `${(s.startMs / 1000).toFixed(1)},${(s.endMs / 1000).toFixed(1)},${s.label}`)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * 채점
 * ------------------------------------------------------------------ */

function rescore(clip: Clip) {
  if (clip.run === null || clip.labels.length === 0) {
    clip.metrics = null;
    return;
  }
  clip.metrics = computeClipMetrics(clip.labels, clip.run.segments, clip.run.durationMs, {
    toleranceMs: state.score.toleranceSec * 1000,
    eventGraceMs: state.score.graceSec * 1000,
  });
}

/* ------------------------------------------------------------------ *
 * 실행
 * ------------------------------------------------------------------ */

async function runAll(onlyId?: number) {
  if (state.running) {
    return;
  }
  const targets = state.clips.filter(
    (c) => c.error === null && (onlyId === undefined || c.id === onlyId),
  );
  if (targets.length === 0) {
    return;
  }
  state.running = true;
  state.abort = new AbortController();
  const signal = state.abort.signal;
  const key = settingsKey();
  render();
  for (const [index, clip] of targets.entries()) {
    if (signal.aborted) {
      break;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = clip.url;
    liveVideoHost.replaceChildren(video);
    try {
      clip.run = await runClip({
        name: clip.file.name,
        video,
        settings: state.settings,
        signal,
        onProgress: (p) => {
          state.progress = { ...p, clipName: clip.file.name, index, total: targets.length };
          renderProgress();
        },
      });
      clip.ranWith = key;
      clip.error = null;
      clip.durationMs = clip.run.durationMs;
      rescore(clip);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        break;
      }
      clip.error = error instanceof Error ? error.message : String(error);
    } finally {
      video.pause();
    }
    render();
  }
  state.running = false;
  state.abort = null;
  state.progress = null;
  liveVideoHost.replaceChildren();
  render();
}

/* ------------------------------------------------------------------ *
 * 그리기 — 타임라인
 * ------------------------------------------------------------------ */

const CLASS_VAR: Record<BenchClass, string> = {
  FOCUS: "var(--c-focus)",
  AWAY: "var(--c-away)",
  PHONE: "var(--c-phone)",
  SLEEP: "var(--c-sleep)",
};

function timelineSvg(clip: Clip): string {
  const run = clip.run;
  if (run === null) {
    return "";
  }
  const W = 1000;
  const L = 112;
  const R = 12;
  const span = W - L - R;
  const dur = Math.max(1, run.durationMs);
  const x = (t: number) => L + (Math.min(Math.max(t, 0), dur) / dur) * span;
  const parts: string[] = [];
  let y = 8;

  const band = (
    label: string,
    segs: { startMs: number; endMs: number; label: BenchClass }[],
    h = 16,
  ) => {
    parts.push(`<text x="0" y="${y + h - 4}">${label}</text>`);
    parts.push(
      `<rect x="${L}" y="${y}" width="${span}" height="${h}" fill="var(--c-none)" opacity=".35"/>`,
    );
    for (const s of segs) {
      const w = Math.max(0.6, x(s.endMs) - x(s.startMs));
      parts.push(
        `<rect x="${x(s.startMs).toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${CLASS_VAR[s.label]}"/>`,
      );
    }
    y += h + 6;
  };

  band("정답", clip.labels);
  band("예측 상태", run.segments);
  y += 4;

  // 원신호(유지시간 이전)
  for (const source of DETECTION_SOURCES) {
    if (source === "DEVICE") {
      continue;
    }
    const events = run.signals.filter((e) => e.source === source);
    parts.push(`<text x="0" y="${y + 7}">${SOURCE_KO[source]}</text>`);
    parts.push(
      `<rect x="${L}" y="${y}" width="${span}" height="8" fill="var(--c-none)" opacity=".25"/>`,
    );
    let onAt: number | null = null;
    for (const e of events) {
      if (e.active && onAt === null) {
        onAt = e.t;
      } else if (!e.active && onAt !== null) {
        parts.push(
          `<rect x="${x(onAt).toFixed(2)}" y="${y}" width="${Math.max(0.6, x(e.t) - x(onAt)).toFixed(2)}" height="8" fill="var(--bad)"/>`,
        );
        onAt = null;
      }
    }
    if (onAt !== null) {
      parts.push(
        `<rect x="${x(onAt).toFixed(2)}" y="${y}" width="${Math.max(0.6, x(dur) - x(onAt)).toFixed(2)}" height="8" fill="var(--bad)"/>`,
      );
    }
    y += 15;
  }
  y += 6;

  const chart = (
    title: string,
    series: { points: [number, number][]; color: string; dots?: boolean }[],
    lines: { v: number; color: string; label: string }[],
    h = 64,
  ) => {
    const yy = (v: number) => y + h - Math.min(1, Math.max(0, v)) * h;
    parts.push(`<text x="0" y="${y + 11}">${title}</text>`);
    parts.push(`<text x="${L - 6}" y="${y + 9}" text-anchor="end">1</text>`);
    parts.push(`<text x="${L - 6}" y="${y + h}" text-anchor="end">0</text>`);
    parts.push(
      `<rect x="${L}" y="${y}" width="${span}" height="${h}" fill="none" stroke="var(--line)"/>`,
    );
    lines.forEach((line, i) => {
      parts.push(
        `<line x1="${L}" x2="${L + span}" y1="${yy(line.v).toFixed(1)}" y2="${yy(line.v).toFixed(1)}" stroke="${line.color}" stroke-dasharray="4 3" stroke-width="1"/>`,
      );
      // 임계선 이름이 겹치지 않게 첫째는 오른쪽, 둘째는 왼쪽 끝에 단다.
      const right = i % 2 === 0;
      parts.push(
        `<text x="${right ? L + span - 2 : L + 4}" y="${(yy(line.v) - 3).toFixed(1)}" text-anchor="${right ? "end" : "start"}">${line.label}</text>`,
      );
    });
    for (const s of series) {
      if (s.points.length === 0) {
        continue;
      }
      if (s.dots === true) {
        parts.push(
          s.points
            .map(
              ([t, v]) =>
                `<circle cx="${x(t).toFixed(1)}" cy="${yy(v).toFixed(1)}" r="1.6" fill="${s.color}"/>`,
            )
            .join(""),
        );
      } else {
        const d = s.points
          .map(([t, v], i) => `${i === 0 ? "M" : "L"}${x(t).toFixed(1)} ${yy(v).toFixed(1)}`)
          .join("");
        parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.3"/>`);
      }
    }
    y += h + 10;
  };

  const s = state.settings;
  chart(
    "검출 점수",
    [
      { points: run.frames.map((f) => [f.t, f.personScore]), color: "var(--c-away)" },
      { points: run.frames.map((f) => [f.t, f.phoneScore]), color: "var(--c-phone)" },
    ],
    [
      { v: s.personThreshold, color: "var(--c-away)", label: `사람 ${s.personThreshold}` },
      { v: s.phoneThreshold, color: "var(--c-phone)", label: `휴대폰 ${s.phoneThreshold}` },
    ],
  );
  if (s.sleepDetection) {
    const thr = run.frames
      .filter((f) => f.eyeThreshold !== null)
      .map((f) => [f.t, f.eyeThreshold ?? 0] as [number, number]);
    chart(
      "눈 감김",
      [
        {
          points: run.frames
            .filter((f) => f.eyeClosure !== null)
            .map((f) => [f.t, f.eyeClosure ?? 0]),
          color: "var(--c-sleep)",
          dots: true,
        },
        { points: thr, color: "var(--ink)" },
        {
          points: run.frames
            .filter((f) => f.eyeClosedRatio !== null)
            .map((f) => [f.t, f.eyeClosedRatio ?? 0]),
          color: "var(--accent)",
        },
      ],
      [{ v: EYE_RATIO_THRESHOLD, color: "var(--accent)", label: `비율 ${EYE_RATIO_THRESHOLD}` }],
    );
  }

  // 시간축
  const step = niceStep(dur / 1000);
  for (let t = 0; t <= dur / 1000 + 1e-6; t += step) {
    parts.push(
      `<line x1="${x(t * 1000).toFixed(1)}" x2="${x(t * 1000).toFixed(1)}" y1="${y - 6}" y2="${y - 2}" stroke="var(--muted)"/>`,
    );
    parts.push(
      `<text x="${x(t * 1000).toFixed(1)}" y="${y + 9}" text-anchor="middle">${clock(t)}</text>`,
    );
  }
  y += 14;
  parts.push(
    `<line class="playhead" x1="${L}" x2="${L}" y1="4" y2="${y - 18}" stroke="var(--accent)" stroke-width="1.5" visibility="hidden"/>`,
  );
  return `<svg class="tl" data-clip="${clip.id}" data-l="${L}" data-span="${span}" data-dur="${dur}" viewBox="0 0 ${W} ${y}" role="img" aria-label="${esc(clip.file.name)}의 정답·예측·원신호·점수 타임라인">${parts.join("")}</svg>`;
}

function niceStep(totalSec: number): number {
  const candidates = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  return candidates.find((c) => totalSec / c <= 10) ?? 3600;
}

/* ------------------------------------------------------------------ *
 * 그리기 — 지표
 * ------------------------------------------------------------------ */

function kpis(m: ClipMetrics, focusRate?: number): string {
  const diff = m.predFocusSec - m.gtFocusSec;
  const diffPct = m.gtFocusSec > 0 ? diff / m.gtFocusSec : null;
  return `<div class="kpis">
    <div class="kpi"><span class="k">시간 정확도</span><span class="v">${pct(m.accuracy)}</span><span class="s">채점 ${secText(m.scoredSec)}</span></div>
    <div class="kpi"><span class="k">Macro F1</span><span class="v">${m.macroF1 === null ? "–" : m.macroF1.toFixed(3)}</span><span class="s">정답에 있는 클래스 평균</span></div>
    <div class="kpi"><span class="k">순공 오차 (예측 − 정답)</span><span class="v ${Math.abs(diffPct ?? 0) > 0.1 ? "bad" : ""}">${diff >= 0 ? "+" : "−"}${secText(Math.abs(diff))}</span><span class="s">${diffPct === null ? "정답 집중 0초" : `${diffPct >= 0 ? "+" : ""}${(diffPct * 100).toFixed(1)}% · 정답 ${secText(m.gtFocusSec)}`}</span></div>
    <div class="kpi"><span class="k">과대 계상 (비집중→집중)</span><span class="v ${m.overCountSec > 0 ? "bad" : "good"}">${secText(m.overCountSec)}</span><span class="s">순공을 부풀린 시간</span></div>
    <div class="kpi"><span class="k">과소 계상 (집중→비집중)</span><span class="v ${m.underCountSec > 0 ? "bad" : "good"}">${secText(m.underCountSec)}</span><span class="s">공부를 지운 시간</span></div>
    ${focusRate === undefined ? "" : `<div class="kpi"><span class="k">예측 집중률</span><span class="v">${pct(focusRate, 0)}</span><span class="s">focusSec ÷ studySec</span></div>`}
  </div>`;
}

function confusionTable(m: ClipMetrics): string {
  const rows = BENCH_CLASSES.filter(
    (gt) => BENCH_CLASSES.some((p) => m.confusionSec[gt][p] > 0) || m.perClass[gt].supportSec > 0,
  );
  if (rows.length === 0) {
    return `<p class="hint">채점할 라벨 구간이 없습니다.</p>`;
  }
  const body = rows
    .map((gt) => {
      const total = BENCH_CLASSES.reduce((a, p) => a + m.confusionSec[gt][p], 0);
      const cells = BENCH_CLASSES.map((p) => {
        const v = m.confusionSec[gt][p];
        const share = total > 0 ? v / total : 0;
        const tint = gt === p ? "var(--good)" : "var(--bad)";
        return `<td class="num" style="background:color-mix(in srgb, ${tint} ${Math.round(share * 38)}%, transparent)">${v > 0 ? secText(v) : "·"}<br><span class="hint">${total > 0 ? pct(share, 0) : ""}</span></td>`;
      }).join("");
      return `<tr><th><span class="pill ${gt}">${CLASS_KO[gt]}</span></th>${cells}</tr>`;
    })
    .join("");
  return `<div class="scroll"><table class="cm"><thead><tr><th>정답 ↓ / 예측 →</th>${BENCH_CLASSES.map((p) => `<th class="num">${CLASS_KO[p]}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function classTable(m: ClipMetrics): string {
  const rows = BENCH_CLASSES.map((c) => {
    const s = m.perClass[c];
    return `<tr><td><span class="pill ${c}">${CLASS_KO[c]}</span></td><td class="num">${pct(s.precision)}</td><td class="num">${pct(s.recall)}</td><td class="num">${s.f1 === null ? "–" : s.f1.toFixed(3)}</td><td class="num">${secText(s.supportSec)}</td></tr>`;
  }).join("");
  return `<div class="scroll"><table><thead><tr><th>클래스</th><th class="num">정밀도</th><th class="num">재현율</th><th class="num">F1</th><th class="num">정답 시간</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function eventTable(m: ClipMetrics): string {
  const rows = m.events
    .map(
      (e) =>
        `<tr><td><span class="pill ${e.label}">${CLASS_KO[e.label]}</span></td><td class="num">${e.gtEvents}</td><td class="num">${e.detected}${e.gtEvents > 0 ? ` <span class="hint">(${pct(e.detected / e.gtEvents, 0)})</span>` : ""}</td><td class="num">${e.meanLatencySec === null ? "–" : `${e.meanLatencySec.toFixed(1)}초`}</td><td class="num">${e.maxLatencySec === null ? "–" : `${e.maxLatencySec.toFixed(1)}초`}</td><td class="num ${e.falseAlarms > 0 ? "bad" : ""}">${e.falseAlarms}</td></tr>`,
    )
    .join("");
  return `<div class="scroll"><table><thead><tr><th>이벤트</th><th class="num">정답 건수</th><th class="num">감지</th><th class="num">평균 지연</th><th class="num">최대 지연</th><th class="num">오경보</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function metricBlock(m: ClipMetrics): string {
  return `<div class="grid2">
    <div class="settings"><h3>혼동 행렬 <span class="hint">(경계 ±${state.score.toleranceSec}초 제외)</span></h3>${confusionTable(m)}</div>
    <div class="settings"><h3>클래스별</h3>${classTable(m)}<h3>이벤트 단위 <span class="hint">(정답 종료 후 ${state.score.graceSec}초까지 인정)</span></h3>${eventTable(m)}</div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * 그리기 — 화면
 * ------------------------------------------------------------------ */

function constantsChips(): string {
  const s = state.settings;
  const changed = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b) ? "" : " changed";
  const holds = DETECTION_SOURCES.filter((src) => src !== "DEVICE")
    .map((src) => {
      const h = s.holds[src];
      const d = DEFAULT_DETECTION_PARAMS[src];
      return `<span class="chip${changed(h, d)}"><b>${src}</b>${h.enterMs / 1000}s↑ ${h.exitMs / 1000}s↓</span>`;
    })
    .join("");
  return `<div class="consts">
    <span class="chip"><b>commit</b>${esc(__BENCH_COMMIT__)} · ${esc(__BENCH_COMMIT_DATE__)}</span>
    <span class="chip${changed(s.modelVariant, "int8")}"><b>객체 모델</b>EfficientDet-Lite0 ${s.modelVariant}</span>
    <span class="chip"><b>프레임</b>${FRAME_INTERVAL_MS}ms · 얼굴 ${FACE_FRAME_DIVISOR}프레임마다</span>
    <span class="chip${changed(s.personThreshold, SCORE_THRESHOLDS.person)}"><b>사람</b>≥ ${s.personThreshold}</span>
    <span class="chip${changed(s.phoneThreshold, SCORE_THRESHOLDS.phone)}"><b>휴대폰</b>≥ ${s.phoneThreshold}</span>
    ${holds}
    <span class="chip"><b>눈 보정</b>${EYE_CALIBRATION_SAMPLES}표본 · p${EYE_CALIBRATION_PERCENTILE * 100} + ${EYE_CALIBRATION_DELTA}</span>
    <span class="chip"><b>졸음 비율</b>${EYE_RATIO_WINDOW_SAMPLES}표본 ≥ ${EYE_RATIO_THRESHOLD} · 뜬 눈 ${EYE_AWAKE_CLEAR_SAMPLES}회 해제</span>
    <span class="chip"><b>내려다봄</b>≥ ${HEAD_PITCH_DOWN_DEG}° 눈 판정 제외</span>
    <span class="chip${changed(s.sleepDetection, true)}"><b>졸음 감지</b>${s.sleepDetection ? "켜짐" : "꺼짐"}</span>
  </div>`;
}

function clipsTable(): string {
  if (state.clips.length === 0) {
    return `<div class="empty-state">
      <p>아직 영상이 없습니다. 위 칸에 벤치 영상과 정답 라벨 파일을 함께 놓으면 파일 이름으로 짝을 짓습니다.</p>
      <p class="hint">라벨 없이도 돌릴 수 있습니다. 그때는 예측 순공·집중률과 타임라인만 나옵니다.</p>
    </div>`;
  }
  const rows = state.clips
    .map((c) => {
      const stale = c.run !== null && c.ranWith !== settingsKey();
      const status = c.error
        ? `<span class="bad">오류</span>`
        : c.run
          ? stale
            ? `<span class="hint">설정 바뀜</span>`
            : `<span class="good">완료</span>`
          : `<span class="hint">대기</span>`;
      return `<tr>
        <td>${esc(c.file.name)}</td>
        <td class="num">${c.durationMs === null ? "…" : clock(c.durationMs / 1000)}</td>
        <td class="num">${c.labels.length > 0 ? `${c.labels.length}구간` : `<span class="hint">없음</span>`}</td>
        <td>${status}</td>
        <td><div class="row"><button type="button" data-act="run-one" data-id="${c.id}" ${state.running ? "disabled" : ""}>실행</button><button type="button" class="link" data-act="remove" data-id="${c.id}" ${state.running ? "disabled" : ""}>빼기</button></div></td>
      </tr>`;
    })
    .join("");
  return `<div class="scroll"><table class="clips-table"><thead><tr><th>영상</th><th class="num">길이</th><th class="num">라벨</th><th>상태</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function settingsForm(): string {
  const s = state.settings;
  const holdRows = DETECTION_SOURCES.filter((src) => src !== "DEVICE")
    .map(
      (src) => `<tr><td>${SOURCE_KO[src]} <span class="hint mono">${src}</span></td>
        <td><input type="number" id="hold-${src}-enter" data-hold="${src}" data-edge="enterMs" min="0" step="100" value="${s.holds[src].enterMs}"></td>
        <td><input type="number" id="hold-${src}-exit" data-hold="${src}" data-edge="exitMs" min="0" step="100" value="${s.holds[src].exitMs}"></td></tr>`,
    )
    .join("");
  const dis = state.running ? "disabled" : "";
  return `<div class="settings">
    <div class="field"><span>실행 방식</span><div class="seg" role="radiogroup" aria-label="실행 방식">
      <label><input type="radio" name="mode" id="mode-manual" value="manual" ${s.mode === "manual" ? "checked" : ""} ${dis}>프레임 단위</label>
      <label><input type="radio" name="mode" id="mode-realtime" value="realtime" ${s.mode === "realtime" ? "checked" : ""} ${dis}>실시간 재생</label>
    </div></div>
    <p class="hint">${s.mode === "manual" ? `영상을 ${FRAME_INTERVAL_MS}ms 간격으로 넘기며 프레임마다 추론이 끝나길 기다립니다. 같은 영상·설정이면 결과가 항상 같고, 영상 길이보다 빨리 끝납니다.` : "프로덕션 루프 그대로 영상을 1배속으로 틉니다. 이 기기의 추론 시간·프레임 버림까지 반영되지만 영상 길이만큼 걸립니다."}</p>
    <div class="field"><span>객체 모델</span><select id="model" ${dis}><option value="int8" ${s.modelVariant === "int8" ? "selected" : ""}>int8 (프로덕션)</option><option value="fp32" ${s.modelVariant === "fp32" ? "selected" : ""}>fp32</option></select></div>
    <div class="field"><span>졸음 감지</span><label><input type="checkbox" id="sleep" ${s.sleepDetection ? "checked" : ""} ${dis}>얼굴 모델 켜기</label></div>
    <div class="field"><span>사람 점수 임계</span><input type="number" id="person-thr" min="${DETECTOR_SCORE_THRESHOLD}" max="1" step="0.05" value="${s.personThreshold}" ${dis}></div>
    <div class="field"><span>휴대폰 점수 임계</span><input type="number" id="phone-thr" min="${DETECTOR_SCORE_THRESHOLD}" max="1" step="0.05" value="${s.phoneThreshold}" ${dis}></div>
    <p class="hint">검출기는 ${DETECTOR_SCORE_THRESHOLD} 미만 점수를 버리므로 그보다 낮은 임계는 효과가 없습니다.</p>
    <div class="settings"><h3>유지시간 (ms)</h3><div class="scroll"><table><thead><tr><th>출처</th><th>진입</th><th>해제</th></tr></thead><tbody>${holdRows}</tbody></table></div></div>
    ${s.mode === "manual" ? `<div class="field"><span>추론 지연 가정</span><label><input type="number" id="latency" min="0" max="999" step="50" value="${s.inferenceLatencyMs}" ${dis}>ms</label></div><p class="hint">실기기 int8 추론 213~371ms 실측을 반영해, 신호가 프레임 시각보다 이만큼 늦게 도착한 것으로 봅니다.</p>` : ""}
    <div class="settings"><h3>채점</h3>
      <div class="field"><span>경계 허용</span><label><input type="number" id="tol" min="0" step="0.5" value="${state.score.toleranceSec}">초</label></div>
      <div class="field"><span>이벤트 유예</span><label><input type="number" id="grace" min="0" step="1" value="${state.score.graceSec}">초</label></div>
      <p class="hint">정답이 바뀌는 시각 앞뒤는 시간 지표에서 뺍니다. 유지시간 때문에 늦는 판정은 이벤트 지연으로 따로 봅니다.</p>
    </div>
    <div class="row"><button type="button" data-act="reset" ${dis}>프로덕션 기본값으로</button></div>
  </div>`;
}

function progressBlock(): string {
  const p = state.progress;
  return `<div class="run">
    <div class="row">
      <button type="button" class="primary" data-act="run-all" ${state.running || state.clips.length === 0 ? "disabled" : ""}>${state.clips.some((c) => c.run) ? "전체 다시 실행" : "벤치 실행"}</button>
      <button type="button" data-act="stop" ${state.running ? "" : "disabled"}>중단</button>
      <span class="hint" id="prog-text">${p ? "" : state.running ? "준비 중…" : "영상과 라벨을 넣고 실행하세요. 영상은 이 브라우저 안에서만 읽고 어디에도 올리지 않습니다."}</span>
    </div>
    <div class="bar" aria-hidden="true"><i id="prog-bar"></i></div>
    <div class="preview" id="preview">${state.running ? "" : `<div class="empty">실행하면 지금 분석 중인 프레임이 여기에 보입니다.</div>`}</div>
    <div class="live" id="live"></div>
  </div>`;
}

function renderProgress() {
  const p = state.progress;
  const text = document.getElementById("prog-text");
  const bar = document.getElementById("prog-bar");
  const live = document.getElementById("live");
  if (!p || !text || !bar || !live) {
    return;
  }
  const frac = (p.index + (p.durationMs > 0 ? p.t / p.durationMs : 0)) / p.total;
  bar.style.width = `${(frac * 100).toFixed(1)}%`;
  text.textContent =
    p.phase === "loading"
      ? `${p.index + 1}/${p.total} ${p.clipName} — 모델 준비 중`
      : `${p.index + 1}/${p.total} ${p.clipName} — ${clock(p.t / 1000)} / ${clock(p.durationMs / 1000)}`;
  const st =
    p.state.kind === "DISTRACTION"
      ? p.state.trigger === "DEVICE"
        ? "PHONE"
        : p.state.trigger
      : "FOCUS";
  live.innerHTML =
    `<span class="pill ${st}">${CLASS_KO[st as BenchClass]}</span>` +
    DETECTION_SOURCES.filter((src) => src !== "DEVICE")
      .map((src) => `<span class="light ${p.signals[src] ? "on" : ""}">${SOURCE_KO[src]}</span>`)
      .join("");
}

function resultsSection(): string {
  const done = state.clips.filter((c) => c.run !== null);
  if (done.length === 0) {
    return "";
  }
  const scored = done.map((c) => c.metrics).filter((m): m is ClipMetrics => m !== null);
  const agg = aggregateMetrics(scored);
  const totalStudy = done.reduce((a, c) => a + (c.run?.totals.studySec ?? 0), 0);
  const totalFocus = done.reduce((a, c) => a + (c.run?.totals.focusSec ?? 0), 0);
  const clipCards = done.map((c) => clipCard(c)).join("");
  return `<section class="panel" aria-labelledby="res-h">
    <div class="panel-head"><h2 id="res-h">결과 ${scored.length > 0 ? `<span class="hint">· 라벨 있는 영상 ${scored.length}개 합산</span>` : ""}</h2>
      <div class="row"><button type="button" data-act="copy-json">결과 JSON 복사</button><button type="button" data-act="copy-summary">요약 CSV 복사</button><button type="button" data-act="copy-frames">프레임 CSV 복사</button></div></div>
    ${agg ? kpis(agg, totalStudy > 0 ? totalFocus / totalStudy : undefined) + metricBlock(agg) : `<p class="hint">정답 라벨이 붙은 영상이 없어 정확도 지표는 비어 있습니다. 예측 결과는 영상별로 아래에 있습니다.</p>`}
    <div class="legend"><span><i style="background:var(--c-focus)"></i>집중</span><span><i style="background:var(--c-away)"></i>자리 이탈</span><span><i style="background:var(--c-phone)"></i>휴대폰</span><span><i style="background:var(--c-sleep)"></i>졸음</span><span><i style="background:var(--bad)"></i>원신호 켜짐</span><span><i style="background:var(--c-none)"></i>라벨 없음</span></div>
    ${clipCards}
  </section>`;
}

function clipCard(c: Clip): string {
  const run = c.run;
  if (run === null) {
    return "";
  }
  const rate = run.totals.studySec > 0 ? run.totals.focusSec / run.totals.studySec : 0;
  const stale = c.ranWith !== settingsKey();
  return `<article class="clip" data-card="${c.id}">
    <div class="clip-head">
      <h3>${esc(c.file.name)}</h3>
      <span class="mono hint">순공 ${clock(run.totals.focusSec)} / 총 ${clock(run.totals.studySec)} · 집중률 ${pct(rate, 0)} · 비집중 ${clock(run.totals.distractionSec)} · 상태 이벤트 ${run.statusEventCount}건</span>
      <span class="mono hint">${run.runtime ?? "?"} · 얼굴 ${run.faceStatus}${run.calibration ? ` · 눈 기준 ${run.calibration.baseline.toFixed(2)}→임계 ${run.calibration.threshold.toFixed(2)}` : ""} · ${(run.wallMs / 1000).toFixed(1)}초 소요</span>
    </div>
    ${stale ? `<p class="warn">이 결과 뒤로 설정을 바꿨습니다. 지금 설정으로 보려면 다시 실행하세요.</p>` : ""}
    ${run.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
    ${c.metrics ? kpis(c.metrics) : ""}
    <div class="review">
      <video src="${c.url}" controls muted playsinline preload="metadata" data-review="${c.id}"></video>
      <div class="scroll">${timelineSvg(c)}<p class="hint">타임라인을 누르면 왼쪽 영상이 그 시각으로 갑니다.</p></div>
    </div>
    <details><summary>정답 라벨 편집 (${c.labels.length}구간)</summary>
      <div class="settings">
        <textarea id="labels-${c.id}" data-labels="${c.id}" spellcheck="false" placeholder="start,end,label&#10;0,45,FOCUS&#10;45,70,PHONE">${esc(labelsToCsv(c.labels))}</textarea>
        <div class="row"><button type="button" data-act="apply-labels" data-id="${c.id}">라벨 적용</button>
        <label>전체를 <select id="whole-${c.id}" data-whole="${c.id}"><option value="">선택</option>${BENCH_CLASSES.map((k) => `<option value="${k}">${CLASS_KO[k]}</option>`).join("")}</select>로</label></div>
        <p class="hint">한 줄에 <code>시작,끝,라벨</code>. 시간은 초나 <code>분:초</code>, 라벨은 FOCUS·AWAY·PHONE·SLEEP(또는 집중·자리이탈·휴대폰·졸음).</p>
      </div>
    </details>
    ${c.metrics ? `<details><summary>이 영상의 상세 지표</summary>${metricBlock(c.metrics)}</details>` : ""}
  </article>`;
}

function render() {
  const focused = document.activeElement?.id ?? null;
  app.innerHTML = `
    <header class="top">
      <span class="eyebrow">FocusMakers · on-device vision</span>
      <h1>포메 Vision 벤치</h1>
      <p class="lede">공부 영상과 정답 라벨을 넣으면, 앱에 들어가 있는 집중 판정 코드(객체 검출 → 판정 규칙 → 유지시간 → 세션 타임라인)를 그대로 돌려 순공 시간과 판정 정확도를 잽니다. 영상은 이 브라우저 밖으로 나가지 않습니다.</p>
      ${constantsChips()}
    </header>
    <div class="grid2">
      <section class="panel" aria-labelledby="data-h">
        <div class="panel-head"><h2 id="data-h">벤치 데이터</h2><button type="button" class="link" data-act="copy-template">라벨 양식 복사</button></div>
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="영상과 라벨 파일 고르기">
          <strong>영상(MP4·WebM)과 라벨(CSV·JSON)을 끌어다 놓기</strong>
          <span class="hint">또는 눌러서 고르기 · 여러 개 한 번에 · 라벨은 <code>file,start,end,label</code></span>
        </div>
        <input type="file" id="file" multiple accept="video/*,.csv,.json,.txt,.tsv" hidden>
        ${state.labelErrors.length > 0 ? `<div class="err">${state.labelErrors.slice(-5).map(esc).join("<br>")}</div>` : ""}
        ${clipsTable()}
        ${state.clips
          .filter((c) => c.error && !c.run)
          .map((c) => `<p class="err">${esc(c.file.name)}: ${esc(c.error ?? "")}</p>`)
          .join("")}
      </section>
      <section class="panel" aria-labelledby="run-h">
        <div class="panel-head"><h2 id="run-h">실행</h2></div>
        ${progressBlock()}
        <details ${state.clips.length === 0 ? "" : "open"}><summary>판정 설정</summary>${settingsForm()}</details>
      </section>
    </div>
    ${resultsSection()}
  `;
  if (state.running) {
    document.getElementById("preview")?.append(liveVideoHost);
    renderProgress();
  }
  if (focused) {
    document.getElementById(focused)?.focus();
  }
}

/* ------------------------------------------------------------------ *
 * 내보내기
 * ------------------------------------------------------------------ */

function exportJson(): string {
  return JSON.stringify(
    {
      tool: "focusmakers-vision-bench",
      commit: __BENCH_COMMIT__,
      commitDate: __BENCH_COMMIT_DATE__,
      generatedAt: new Date().toISOString(),
      settings: state.settings,
      scoring: state.score,
      aggregate: aggregateMetrics(
        state.clips.map((c) => c.metrics).filter((m): m is ClipMetrics => m !== null),
      ),
      clips: state.clips
        .filter((c) => c.run)
        .map((c) => ({
          file: c.file.name,
          durationMs: c.run?.durationMs,
          totals: c.run?.totals,
          labels: c.labels,
          predicted: c.run?.segments,
          metrics: c.metrics,
          signals: c.run?.signals,
          calibration: c.run?.calibration,
          frames: c.run?.frames,
        })),
    },
    null,
    1,
  );
}

function exportSummaryCsv(): string {
  const head =
    "file,duration_s,study_s,focus_s,gt_focus_s,pred_focus_in_labels_s,over_s,under_s,accuracy,macro_f1,away_recall,phone_recall,sleep_recall,phone_precision";
  const lines = state.clips
    .filter((c) => c.run)
    .map((c) => {
      const m = c.metrics;
      const r = c.run as ClipRun;
      const f = (v: number | null | undefined) =>
        v === null || v === undefined ? "" : v.toFixed(4);
      return [
        `"${c.file.name.replace(/"/g, '""')}"`,
        (r.durationMs / 1000).toFixed(1),
        r.totals.studySec,
        r.totals.focusSec,
        f(m?.gtFocusSec),
        f(m?.predFocusSec),
        f(m?.overCountSec),
        f(m?.underCountSec),
        f(m?.accuracy),
        f(m?.macroF1),
        f(m?.perClass.AWAY.recall),
        f(m?.perClass.PHONE.recall),
        f(m?.perClass.SLEEP.recall),
        f(m?.perClass.PHONE.precision),
      ].join(",");
    });
  return [head, ...lines].join("\n");
}

function exportFramesCsv(): string {
  const head =
    "file,t_s,person_present,person_score,phone_score,phone_signal,face_ran,face_present,eye_closure,eye_threshold,eye_closed_ratio,head_pitch_deg,face_skip,sleep_eyes,sleep_drowsy,infer_ms";
  const lines: string[] = [];
  for (const c of state.clips) {
    for (const f of c.run?.frames ?? []) {
      const v = (x: number | boolean | string | null) =>
        x === null ? "" : typeof x === "number" ? String(Math.round(x * 1000) / 1000) : String(x);
      lines.push(
        [
          `"${c.file.name.replace(/"/g, '""')}"`,
          (f.t / 1000).toFixed(1),
          v(f.personPresent),
          v(f.personScore),
          v(f.phoneScore),
          v(f.phoneSignal),
          v(f.faceRan),
          v(f.facePresent),
          v(f.eyeClosure),
          v(f.eyeThreshold),
          v(f.eyeClosedRatio),
          v(f.headPitchDeg),
          v(f.faceSkip),
          v(f.sleepEyes),
          v(f.sleepDrowsy),
          v(f.durationMs),
        ].join(","),
      );
    }
  }
  return [head, ...lines].join("\n");
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what}를 복사했습니다`);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("aria-label", what);
    area.style.position = "fixed";
    area.style.inset = "10% 5%";
    area.style.width = "90%";
    area.style.height = "80%";
    area.style.zIndex = "20";
    document.body.append(area);
    area.select();
    toast("복사가 막혀 있어 텍스트를 선택해 두었습니다. 바깥을 누르면 닫힙니다.");
    area.addEventListener("blur", () => area.remove(), { once: true });
  }
}

/* ------------------------------------------------------------------ *
 * 이벤트
 * ------------------------------------------------------------------ */

function updateSettings(patch: Partial<BenchSettings>) {
  state.settings = { ...state.settings, ...patch };
  render();
}

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("#drop")) {
    (document.getElementById("file") as HTMLInputElement | null)?.click();
    return;
  }
  const svg = target.closest("svg.tl") as SVGSVGElement | null;
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const xView = ((event.clientX - rect.left) / rect.width) * vb.width;
    const L = Number(svg.dataset.l);
    const span = Number(svg.dataset.span);
    const dur = Number(svg.dataset.dur);
    const t = Math.min(Math.max((xView - L) / span, 0), 1) * dur;
    const video = document.querySelector(
      `video[data-review="${svg.dataset.clip}"]`,
    ) as HTMLVideoElement | null;
    if (video) {
      video.currentTime = t / 1000;
    }
    return;
  }
  const button = target.closest("button") as HTMLButtonElement | null;
  if (!button) {
    return;
  }
  const id = Number(button.dataset.id);
  switch (button.dataset.act) {
    case "run-all":
      void runAll();
      break;
    case "run-one":
      void runAll(id);
      break;
    case "stop":
      state.abort?.abort();
      break;
    case "remove": {
      const clip = state.clips.find((c) => c.id === id);
      if (clip) {
        URL.revokeObjectURL(clip.url);
      }
      state.clips = state.clips.filter((c) => c.id !== id);
      render();
      break;
    }
    case "reset":
      state.settings = structuredClone(DEFAULT_SETTINGS);
      render();
      break;
    case "apply-labels": {
      const clip = state.clips.find((c) => c.id === id);
      const area = document.getElementById(`labels-${id}`) as HTMLTextAreaElement | null;
      if (clip && area) {
        const parsed = parseLabels(area.value);
        const segments = [...parsed.byClip.values()].flat().sort((a, b) => a.startMs - b.startMs);
        if (parsed.errors.length > 0) {
          toast(parsed.errors[0] ?? "라벨을 읽지 못했습니다");
        }
        clip.labels = segments;
        rescore(clip);
        render();
      }
      break;
    }
    case "copy-template":
      void copy(LABEL_TEMPLATE, "라벨 양식");
      break;
    case "copy-json":
      void copy(exportJson(), "결과 JSON");
      break;
    case "copy-summary":
      void copy(exportSummaryCsv(), "요약 CSV");
      break;
    case "copy-frames":
      void copy(exportFramesCsv(), "프레임 CSV");
      break;
  }
});

app.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.id === "drop" && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    (document.getElementById("file") as HTMLInputElement | null)?.click();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "file" && target.files) {
    void addFiles(target.files);
    target.value = "";
    return;
  }
  if (target.name === "mode") {
    updateSettings({ mode: target.value as BenchSettings["mode"] });
  } else if (target.id === "model") {
    updateSettings({ modelVariant: target.value as BenchSettings["modelVariant"] });
  } else if (target.id === "sleep") {
    updateSettings({ sleepDetection: target.checked });
  } else if (target.id === "person-thr" || target.id === "phone-thr") {
    const value = Math.min(1, Math.max(DETECTOR_SCORE_THRESHOLD, Number(target.value)));
    if (Number.isFinite(value)) {
      updateSettings(
        target.id === "person-thr" ? { personThreshold: value } : { phoneThreshold: value },
      );
    }
  } else if (target.id === "latency") {
    updateSettings({ inferenceLatencyMs: Math.min(999, Math.max(0, Number(target.value) || 0)) });
  } else if (target.dataset.hold) {
    const src = target.dataset.hold as DetectionSource;
    const edge = target.dataset.edge as "enterMs" | "exitMs";
    const value = Math.max(0, Number(target.value) || 0);
    updateSettings({
      holds: { ...state.settings.holds, [src]: { ...state.settings.holds[src], [edge]: value } },
    });
  } else if (target.id === "tol" || target.id === "grace") {
    const value = Math.max(0, Number(target.value) || 0);
    if (target.id === "tol") {
      state.score.toleranceSec = value;
    } else {
      state.score.graceSec = value;
    }
    state.clips.forEach(rescore);
    render();
  } else if (target.dataset.whole) {
    const clip = state.clips.find((c) => c.id === Number(target.dataset.whole));
    const label = target.value as BenchClass;
    if (clip && label && clip.durationMs) {
      clip.labels = [{ startMs: 0, endMs: clip.durationMs, label }];
      rescore(clip);
      render();
    }
  }
});

app.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.getElementById("drop")?.classList.add("over");
});
app.addEventListener("dragleave", () => document.getElementById("drop")?.classList.remove("over"));
app.addEventListener("drop", (event) => {
  event.preventDefault();
  document.getElementById("drop")?.classList.remove("over");
  if (event.dataTransfer?.files) {
    void addFiles(event.dataTransfer.files);
  }
});

// 검토 영상 재생 위치를 타임라인에 그린다.
app.addEventListener(
  "timeupdate",
  (event) => {
    const video = event.target as HTMLVideoElement;
    const id = video.dataset.review;
    if (!id) {
      return;
    }
    const svg = document.querySelector(`svg.tl[data-clip="${id}"]`) as SVGSVGElement | null;
    const head = svg?.querySelector(".playhead");
    if (!svg || !head) {
      return;
    }
    const x =
      Number(svg.dataset.l) +
      ((video.currentTime * 1000) / Number(svg.dataset.dur)) * Number(svg.dataset.span);
    head.setAttribute("x1", x.toFixed(1));
    head.setAttribute("x2", x.toFixed(1));
    head.setAttribute("visibility", "visible");
  },
  true,
);
app.addEventListener(
  "seeked",
  (event) =>
    event.target instanceof HTMLVideoElement && event.target.dispatchEvent(new Event("timeupdate")),
  true,
);

render();
