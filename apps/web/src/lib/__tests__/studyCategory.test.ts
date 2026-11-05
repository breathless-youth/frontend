import { describe, expect, it } from "vitest";

import { isStudyCategory, studyCategoryLabel, studyCategoryOptions } from "@/lib/studyCategory";

describe("studyCategory", () => {
  it("프로필과 그룹이 같은 순서의 9개를 쓴다", () => {
    expect(studyCategoryOptions().map((option) => `${option.value}:${option.label}`)).toEqual([
      "CSAT:수능",
      "SCHOOL_EXAM:내신",
      "UNIVERSITY_EXAM:대학 시험",
      "CIVIL_SERVICE:공무원",
      "CERTIFICATE:자격증",
      "LANGUAGE:어학",
      "JOB:취업",
      "PROFESSIONAL:전문직",
      "ETC:기타",
    ]);
  });

  it("서버 값만 시험·목표로 본다", () => {
    expect(isStudyCategory("SCHOOL_EXAM")).toBe(true);
    expect(isStudyCategory("자격증")).toBe(false);
    expect(isStudyCategory("SELF_DEVELOPMENT")).toBe(false);
    expect(isStudyCategory(null)).toBe(false);
  });

  it("모르는 값의 라벨은 없다", () => {
    expect(studyCategoryLabel("UNIVERSITY_EXAM")).toBe("대학 시험");
    expect(studyCategoryLabel("UNKNOWN")).toBeNull();
    expect(studyCategoryLabel(null)).toBeNull();
  });
});
