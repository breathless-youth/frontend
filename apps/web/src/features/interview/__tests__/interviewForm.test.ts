import { describe, expect, it, vi } from "vitest";

import { hardNavigate } from "@/lib/hardNavigation";

import {
  fillNickname,
  interviewFormPath,
  isGoogleFormUrl,
  openInterviewForm,
  readFormParam,
} from "../interviewForm";

vi.mock("@/lib/hardNavigation", () => ({ hardNavigate: vi.fn(), hardReplace: vi.fn() }));

const FORM = "https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.1606714956=NICKNAME";

describe("fillNickname", () => {
  it("한글·띄어쓰기·이모지를 인코딩해 넣는다", () => {
    const url = fillNickname(FORM, "공부하는 포메🐶");
    expect(new URL(url).searchParams.get("entry.1606714956")).toBe("공부하는 포메🐶");
  });
  it("&가 들어가도 다른 파라미터를 만들지 않는다", () => {
    const url = fillNickname(FORM, "a&usp=x");
    const params = new URL(url).searchParams;
    expect(params.get("entry.1606714956")).toBe("a&usp=x");
    expect(params.getAll("usp")).toEqual(["pp_url"]);
  });
  it("닉네임이 없으면 빈 값으로 바꾼다", () => {
    expect(new URL(fillNickname(FORM, null)).searchParams.get("entry.1606714956")).toBe("");
  });
});

describe("isGoogleFormUrl", () => {
  it("docs.google.com/forms https 주소만 허용한다", () => {
    expect(isGoogleFormUrl(FORM)).toBe(true);
    expect(isGoogleFormUrl("http://docs.google.com/forms/x")).toBe(false);
    expect(isGoogleFormUrl("https://evil.example/forms/x")).toBe(false);
    expect(isGoogleFormUrl("https://docs.google.com/document/x")).toBe(false);
    expect(isGoogleFormUrl("not a url")).toBe(false);
  });
});

describe("interviewFormPath", () => {
  it("기존 쿼리를 유지하고 form을 더한다", () => {
    const path = interviewFormPath(FORM, "?userId=7&appVersion=1.3.0");
    const params = new URLSearchParams(path.split("?")[1]);
    expect(path.startsWith("/interview?")).toBe(true);
    expect(params.get("userId")).toBe("7");
    expect(params.get("appVersion")).toBe("1.3.0");
    expect(params.get("form")).toBe(FORM);
  });
});

describe("readFormParam", () => {
  it("interviewFormPath가 넣은 form 값을 디코딩해 돌려주고, 없으면 null이다", () => {
    const path = interviewFormPath(FORM, "?userId=7");
    expect(readFormParam(`?${path.split("?")[1]}`)).toBe(FORM);
    expect(readFormParam("?userId=7")).toBeNull();
  });
});

describe("openInterviewForm", () => {
  it("하드 내비게이션으로 /interview를 연다", () => {
    openInterviewForm(FORM, "");
    expect(hardNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/interview\?form=/));
  });
});
