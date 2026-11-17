import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { MascotId } from "../types";

/**
 * 공부 완료 화면의 표정 그림이 기본 그림과 같은 크기·자리에 있는지 고정한다.
 * 소품은 기본 그림에 맞춰 그려서, 표정 그림의 몸이 조금만 커도 웃는 표정에서 소품과 몸 사이에 틈이 보인다.
 */
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(currentDir, "../../../assets");
const MASCOTS: MascotId[] = [
  "book",
  "planner",
  "pencil",
  "stopwatch",
  "lamp",
  "padlock",
  "camcorder",
];
// 점프는 몸이 기울어 있어 기울기 값(MASCOT_JUMP_TILT)이 맞추고, 여기서는 서 있는 네 장만 본다.
const STANDING = ["idle", "squint", "closed", "joy"] as const;

/** 8비트 RGBA, 비월 주사 없는 PNG의 알파 값(0~255)을 줄 단위로 푼다. */
function readAlpha(file: string): { width: number; height: number; alpha: Uint8Array } {
  const png = readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) {
        throw new Error(`${file}: 8비트 RGBA 비월 주사 없는 PNG만 읽는다`);
      }
    } else if (type === "IDAT") {
      data.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const paeth = () => {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      };
      const predictor = [0, left, up, (left + up) >> 1, paeth()][filter];
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) alpha[i] = pixels[i * 4 + 3];
  return { width, height, alpha };
}

/** 알파가 절반 넘는 픽셀을 몸으로 보고 그 바깥 끝 줄과 넓이를 구한다. */
function silhouette(file: string) {
  const { width, height, alpha } = readAlpha(file);
  const inside = Array.from(alpha, (value) => value >= 128);
  let [left, top, right, bottom] = [width, height, -1, -1];
  inside.forEach((on, i) => {
    if (!on) return;
    const x = i % width;
    const y = Math.floor(i / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  });
  return { inside, edges: [left, top, right, bottom], size: [width, height] };
}

describe("표정 그림과 기본 그림의 몸", () => {
  it.each(MASCOTS)(
    "%s의 서 있는 표정 네 장은 기본 그림과 같은 판 크기에 몸이 같은 자리에 있다",
    (id) => {
      const base = silhouette(path.join(assets, `points/mascot-${id}.png`));
      for (const expression of STANDING) {
        const face = silhouette(path.join(assets, `mascot/expressions/${id}-${expression}.png`));
        expect(face.size).toEqual(base.size);
        // 바깥 끝 줄(왼쪽, 위, 오른쪽, 바닥)이 320 판에서 2px 안이다.
        face.edges.forEach((edge, side) => {
          expect(Math.abs(edge - base.edges[side]), `${expression} ${side}`).toBeLessThanOrEqual(2);
        });
        // 몸이 겹치는 넓이 비율(IoU)이 0.98 이상이다. 맞추기 전에는 0.970~0.983이었다.
        let both = 0;
        let either = 0;
        face.inside.forEach((on, i) => {
          if (on && base.inside[i]) both += 1;
          if (on || base.inside[i]) either += 1;
        });
        expect(both / either, expression).toBeGreaterThanOrEqual(0.98);
      }
    },
  );
});
