import { describe, expect, it } from "vitest";

import { subjectColorVar, subjectRefMap } from "../recordsTimetable";

describe("subjectRefMap — 과목 id로 이름·색을 찾는다", () => {
  it("지운 과목도 이름·색을 찾을 수 있고, 없으면 빈 맵이다", () => {
    const map = subjectRefMap([
      { id: 3, name: "영어", colorIndex: 2, deleted: false },
      { id: 5, name: "수학", colorIndex: 5, deleted: true },
    ]);
    expect(map.get(5)?.deleted).toBe(true);
    expect(subjectRefMap(undefined).size).toBe(0);
  });

  it("이름이 같은 과목은 id가 달라도 살아있는 과목 하나로 모은다", () => {
    const map = subjectRefMap([
      { id: 3, name: "소마", colorIndex: 2, deleted: true },
      { id: 5, name: "소마", colorIndex: 7, deleted: false },
    ]);

    expect(map.get(3)).toEqual({ id: 5, name: "소마", colorIndex: 7, deleted: false });
    expect(map.get(5)).toEqual({ id: 5, name: "소마", colorIndex: 7, deleted: false });
  });
});

describe("subjectColorVar", () => {
  it("colorIndex를 20색 팔레트 변수로 순환 매핑한다", () => {
    expect(subjectColorVar(0)).toBe("var(--subject-0)");
    expect(subjectColorVar(19)).toBe("var(--subject-19)");
    expect(subjectColorVar(20)).toBe("var(--subject-0)");
    expect(subjectColorVar(-1)).toBe("var(--subject-19)");
  });
});
