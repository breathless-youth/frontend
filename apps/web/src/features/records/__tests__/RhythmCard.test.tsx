import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { RhythmCard } from "../RhythmCard";

describe("RhythmCard — 나의 공부 리듬 예상 화면", () => {
  it("제목과 준비 중 칩, 샘플 안내 문구를 보여준다", () => {
    render(<RhythmCard />);

    expect(screen.getByRole("heading", { name: "나의 공부 리듬" })).toBeInTheDocument();
    expect(screen.getByText("집중 리포트 준비 중")).toBeInTheDocument();
    expect(screen.getByText("기록이 쌓이면 표시돼요")).toBeInTheDocument();
    expect(screen.getByText("지금은 샘플 데이터가 표시돼요")).toBeInTheDocument();
  });

  it("예시 히트맵(요일 7 × 시간 24)은 장식이라 보조 기술에서 숨긴다", () => {
    const { container } = render(<RhythmCard />);

    const ghost = container.querySelector('[aria-hidden="true"]');
    expect(ghost).not.toBeNull();
    expect(ghost?.querySelectorAll("span.h-3\\.25")).toHaveLength(7 * 24);
    // 가로축은 5시에서 시작해 다음 날 4시에서 끝난다 — 눈금 5 · 11 · 17 · 23 · 4.
    expect(ghost).toHaveTextContent("51117234");
    // 안내 문구는 장식 밖에 있어 읽힌다.
    expect(ghost).not.toHaveTextContent("샘플");
  });
});

describe("RhythmCard — 영어", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
    vi.restoreAllMocks();
  });

  it("요일 열은 한 글자(M T W T F S S)이고 같은 글자가 겹쳐도 key 경고가 없다", async () => {
    await i18n.changeLanguage("en");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<RhythmCard />);

    const ghost = container.querySelector('[aria-hidden="true"]');
    expect(ghost).toHaveTextContent(/^MTWTFSS/);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
