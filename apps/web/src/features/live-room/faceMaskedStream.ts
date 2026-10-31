import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

import type { StickerPlacement } from "./faceMaskPlan";
import { followSpot, maskModeOf } from "./faceMaskPlan";

/**
 * 얼굴을 가린 송신 영상 (WebGL)
 *
 * 카메라 영상을 캔버스에 초당 15번 다시 그리고 이모지를 덮어, 그 캔버스를 상대에게 보내는 트랙으로 쓴다.
 * 내 화면에만 그리면 상대는 원본 얼굴을 받으므로 보내는 영상 자체를 바꿔야 한다.
 * 2D 캔버스의 `drawImage(video)`는 Galaxy A23에서 출력 크기와 상관없이 프레임당 약 80ms가 걸렸다.
 * WebGL은 영상을 GPU 텍스처로 바로 올려 그리므로 프레임을 CPU로 꺼내는 그 비용이 없다.
 * 흐림은 영상을 아주 작게 줄였다가 주변과 섞으며 키워 얼굴을 알아볼 수 없게 만든다.
 * 블록마다 한 점만 읽는 모자이크는 거칠고 움직일 때 칸 색이 튀어서 쓰지 않는다.
 */

const SEND_HEIGHT = 360;
const SEND_FPS = 15;
/** 흐릴 때 영상을 줄이는 가로 픽셀 수. 작을수록 더 흐려진다. */
const BLUR_COLUMNS = 24;

// 사각형 하나를 캔버스 좌표(왼쪽 위 0, 오른쪽 아래 1)로 받아 그 자리에 텍스처를 그린다.
const VERTEX_SHADER = `
attribute vec2 a_unit;
uniform vec4 u_rect;
varying vec2 v_uv;
void main() {
  vec2 p = u_rect.xy + a_unit * u_rect.zw;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  v_uv = a_unit;
}`;

// u_step이 0이 아니면 그 간격으로 4×4 점을 읽어 평균을 낸다. 줄일 때와 키울 때 모두 쓴다.
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_step;
varying vec2 v_uv;
void main() {
  if (u_step.x <= 0.0) {
    gl_FragColor = texture2D(u_tex, v_uv);
    return;
  }
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      sum += texture2D(u_tex, v_uv + (vec2(float(i), float(j)) - 1.5) * u_step);
    }
  }
  gl_FragColor = sum / 16.0;
}`;

export interface FaceMaskedStreamStats {
  readonly height: number;
  /** 최근 1초 동안 그린 프레임 수 */
  readonly fps: number;
  /** 카메라 영상을 그리는 데 걸린 메인 스레드 시간(흐림 포함, 지수 평균) */
  readonly videoMs: number;
  /** 이모지를 덮는 데 걸린 시간(지수 평균) */
  readonly stickerMs: number;
}

export interface FaceMaskedStream {
  readonly stream: MediaStream;
  setSpot(spot: FaceSpot | null): void;
  setSticker(url: string): void;
  start(): void;
  pause(): void;
  /** 개발 빌드 측정용 */
  stats(): FaceMaskedStreamStats;
}

/** 컨텍스트에 매인 GPU 자원. 컨텍스트가 끊겼다 돌아오면 전부 다시 만든다. */
interface GlResources {
  readonly rect: WebGLUniformLocation | null;
  readonly step: WebGLUniformLocation | null;
  readonly videoTexture: WebGLTexture;
  readonly stickerTexture: WebGLTexture;
  /** 흐릴 때 영상을 줄여 담아 두는 작은 그림판 */
  readonly smallTexture: WebGLTexture;
  readonly smallFramebuffer: WebGLFramebuffer;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true ? shader : null;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 영상 크기가 2의 거듭제곱이 아니어도 쓸 수 있게 반복과 밉맵을 끈다.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

/** 셰이더 컴파일이나 링크에 실패하거나 준비 중 연결이 끊기면 null이다. */
function setup(gl: WebGLRenderingContext): GlResources | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (vertex === null || fragment === null) {
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    return null;
  }
  gl.useProgram(program);

  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const unit = gl.getAttribLocation(program, "a_unit");
  gl.enableVertexAttribArray(unit);
  gl.vertexAttribPointer(unit, 2, gl.FLOAT, false, 0, 0);
  // 이모지 PNG의 투명한 가장자리가 검게 번지지 않게 알파를 미리 곱해 올리고 그에 맞춰 섞는다.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  // 만드는 도중 연결이 끊기면 일부 자원이 비어 검은 화면만 나가므로 미지원으로 다룬다.
  if (gl.isContextLost()) {
    return null;
  }

  return {
    rect: gl.getUniformLocation(program, "u_rect"),
    step: gl.getUniformLocation(program, "u_step"),
    videoTexture: createTexture(gl),
    stickerTexture: createTexture(gl),
    smallTexture: createTexture(gl),
    smallFramebuffer: gl.createFramebuffer(),
  };
}

/** 캔버스 영상 송신이나 WebGL을 쓸 수 없으면 null이고, 호출부는 미지원으로 다룬다. */
export function createFaceMaskedStream(
  video: () => HTMLVideoElement | null,
): FaceMaskedStream | null {
  try {
    return buildFaceMaskedStream(video);
  } catch {
    // 지원 여부 확인을 통과하고도 생성 중에 예외를 내는 웹뷰가 있어 미지원으로 다룬다.
    return null;
  }
}

function buildFaceMaskedStream(video: () => HTMLVideoElement | null): FaceMaskedStream | null {
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    return null;
  }
  canvas.height = SEND_HEIGHT;
  canvas.width = Math.round((SEND_HEIGHT * 16) / 9);
  const context = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: true });
  if (context === null) {
    return null;
  }
  const gl: WebGLRenderingContext = context;
  let gpu = setup(gl);
  if (gpu === null) {
    return null;
  }
  const stream = canvas.captureStream(SEND_FPS);
  if (stream.getVideoTracks().length === 0) {
    return null;
  }

  let lost = false;
  let smallSize = { width: 0, height: 0 };
  let stickerUrl: string | null = null;
  let stickerImage: HTMLImageElement | null = null;
  let target: FaceSpot | null = null;
  let current: StickerPlacement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frames: number[] = [];
  let videoMs = 0;
  let stickerMs = 0;

  function uploadSticker(resources: GlResources, image: HTMLImageElement): void {
    gl.bindTexture(gl.TEXTURE_2D, resources.stickerTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  // 끊긴 동안 그리지 않으면 상대에게는 마지막 가린 프레임이 남는다.
  // 기본 동작대로 두면 복구 이벤트가 오지 않아 preventDefault로 복구를 요청한다.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    gpu = setup(gl);
    lost = gpu === null;
    smallSize = { width: 0, height: 0 };
    if (gpu !== null && stickerImage !== null) {
      uploadSticker(gpu, stickerImage);
    }
  });

  function average(previous: number, sample: number): number {
    return previous === 0 ? sample : previous * 0.9 + sample * 0.1;
  }

  function drawQuad(
    resources: GlResources,
    x: number,
    y: number,
    w: number,
    h: number,
    stepX = 0,
    stepY = 0,
  ): void {
    gl.uniform4f(resources.rect, x, y, w, h);
    gl.uniform2f(resources.step, stepX, stepY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawBlurred(resources: GlResources): void {
    const width = BLUR_COLUMNS;
    const height = Math.max(1, Math.round((BLUR_COLUMNS * canvas.height) / canvas.width));
    if (smallSize.width !== width || smallSize.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, resources.smallTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.smallFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        resources.smallTexture,
        0,
      );
      smallSize = { width, height };
    }
    // 줄이기: 작은 픽셀 하나가 덮는 원본 범위에서 16점을 평균 낸다.
    // 그림판은 아래쪽이 0번 줄이라 위아래를 뒤집어 그려야 영상 텍스처와 방향이 같아진다.
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.smallFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, resources.videoTexture);
    drawQuad(resources, 0, 1, 1, -1, 1 / width / 4, 1 / height / 4);
    // 키우기: 작은 그림의 이웃 픽셀을 섞어 칸 경계가 보이지 않게 한다.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, resources.smallTexture);
    drawQuad(resources, 0, 0, 1, 1, 1 / width, 1 / height);
  }

  function draw(): void {
    const source = video();
    if (lost || gpu === null) {
      return;
    }
    if (source === null || source.readyState < 2 || source.videoWidth === 0) {
      return;
    }
    const resources = gpu;
    const startedAt = performance.now();
    const width = Math.round((SEND_HEIGHT * source.videoWidth) / source.videoHeight);
    if (canvas.width !== width) {
      canvas.width = width;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    const mode = maskModeOf(target, stickerImage !== null);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, resources.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mode === "blur") {
      drawBlurred(resources);
    } else {
      drawQuad(resources, 0, 0, 1, 1);
    }
    const videoDoneAt = performance.now();

    if (mode === "sticker" && target !== null) {
      current = followSpot(current, target);
      // 크기는 캔버스 폭 기준이라 세로 비율로 다시 맞춰야 정사각형이 된다.
      const side = current.size;
      const sideY = (current.size * canvas.width) / canvas.height;
      gl.enable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, resources.stickerTexture);
      drawQuad(resources, current.x - side / 2, current.y - sideY / 2, side, sideY);
    } else {
      current = null;
    }

    const now = performance.now();
    videoMs = average(videoMs, videoDoneAt - startedAt);
    stickerMs = average(stickerMs, now - videoDoneAt);
    frames = [...frames.filter((at) => now - at < 1000), now];
  }

  return {
    stream,
    setSpot(spot) {
      target = spot;
    },
    setSticker(url) {
      const image = new Image();
      stickerUrl = url;
      stickerImage = null;
      image.onload = () => {
        // 이모지를 빠르게 바꾸면 먼저 요청한 이미지가 늦게 도착해 새 선택을 덮을 수 있다.
        if (stickerUrl !== url) {
          return;
        }
        // 끊긴 동안 도착한 이미지는 복구 때 다시 올린다.
        if (!lost && gpu !== null) {
          uploadSticker(gpu, image);
        }
        stickerImage = image;
      };
      image.src = url;
    },
    start() {
      timer ??= setInterval(draw, 1000 / SEND_FPS);
    },
    pause() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    stats() {
      const now = performance.now();
      return {
        height: canvas.height,
        fps: frames.filter((at) => now - at < 1000).length,
        videoMs: Math.round(videoMs * 10) / 10,
        stickerMs: Math.round(stickerMs * 10) / 10,
      };
    },
  };
}
