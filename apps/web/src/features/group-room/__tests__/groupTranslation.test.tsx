import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { pickGroupText, toggleShowOriginal, useShowOriginal } from "../model/groupTranslation";

describe("pickGroupText", () => {
  it("번역이 있으면 번역을, 원문 보기면 원문을 고른다", () => {
    expect(pickGroupText("원문", "Translated", false)).toBe("Translated");
    expect(pickGroupText("원문", "Translated", true)).toBe("원문");
  });

  it("번역이 없거나 공백뿐이면 원문을 고른다", () => {
    expect(pickGroupText("원문", null, false)).toBe("원문");
    expect(pickGroupText("원문", "   ", false)).toBe("원문");
  });
});

function Probe({ label }: { label: string }) {
  return <span data-testid={label}>{String(useShowOriginal())}</span>;
}

describe("useShowOriginal", () => {
  it("처음은 번역 보기이고 한 번 바꾸면 같은 문서의 모든 화면이 함께 원문으로 바뀐다", () => {
    render(
      <>
        <Probe label="list" />
        <Probe label="detail" />
      </>,
    );
    expect(screen.getByTestId("list")).toHaveTextContent("false");
    act(() => toggleShowOriginal());
    expect(screen.getByTestId("list")).toHaveTextContent("true");
    expect(screen.getByTestId("detail")).toHaveTextContent("true");
  });
});
