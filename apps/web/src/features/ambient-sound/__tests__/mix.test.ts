import { describe, expect, it } from "vitest";

import type { AmbientSound } from "../catalog";
import { activeIds, setLevel } from "../mix";
import type { Mix } from "../mix";

const CATALOG: AmbientSound[] = [
  { id: "white", kind: "synth", label: "백색소음" },
  { id: "pink", kind: "synth", label: "핑크노이즈" },
  { id: "brown", kind: "synth", label: "브라운노이즈" },
  { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3" },
  { id: "cafe", kind: "file", label: "카페", file: "cafe.mp3" },
];

describe("setLevel", () => {
  it("0~100 으로 자른다", () => {
    expect(setLevel({ white: 60 }, "white", 150)).toEqual({ white: 100 });
    expect(setLevel({ white: 60 }, "white", -5)).toEqual({});
  });

  it("0 이면 키를 지운다", () => {
    expect(setLevel({ white: 60, rain: 70 }, "white", 0)).toEqual({ rain: 70 });
  });

  it("꺼진 소리에 레벨을 주면 켠다", () => {
    expect(setLevel({}, "rain", 30)).toEqual({ rain: 30 });
  });

  /** 겹쳐 켜는 개수에 상한이 없다. 상한이 되살아나면 여기서 잡는다. */
  it("이미 여럿 켜져 있어도 새 소리를 켠다", () => {
    const many: Mix = { white: 60, pink: 60, brown: 60, rain: 70, cafe: 50 };
    expect(setLevel(many, "extra", 30)).toEqual({ ...many, extra: 30 });
  });

  it("입력 믹스를 바꾸지 않는다", () => {
    const mix: Mix = { white: 60 };
    setLevel(mix, "rain", 30);
    expect(mix).toEqual({ white: 60 });
  });
});

describe("activeIds", () => {
  it("카탈로그 순서로 정렬한다", () => {
    expect(activeIds({ cafe: 50, white: 60, rain: 70 }, CATALOG)).toEqual([
      "white",
      "rain",
      "cafe",
    ]);
  });

  it("카탈로그에 없는 id 는 제외한다", () => {
    expect(activeIds({ ghost: 50, white: 60 }, CATALOG)).toEqual(["white"]);
  });
});
