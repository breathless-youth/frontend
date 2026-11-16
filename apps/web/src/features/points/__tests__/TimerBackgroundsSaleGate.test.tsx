import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { TimerBackgroundsSaleGate } from "../TimerBackgroundsSaleGate";

function LocationProbe() {
  const location = useLocation();
  return <p>주소 {`${location.pathname}${location.search}`}</p>;
}

describe("TimerBackgroundsSaleGate", () => {
  it("타이머 배경을 팔지 않는 동안 배경 주소로 바로 들어오면 고른 상품을 떼고 상점으로 돌려보낸다", () => {
    render(
      <MemoryRouter initialEntries={["/points/backgrounds?userId=7&item=bg-dawn-library"]}>
        <Routes>
          <Route
            path="/points/backgrounds"
            element={
              <TimerBackgroundsSaleGate>
                <p>타이머 배경 화면</p>
              </TimerBackgroundsSaleGate>
            }
          />
          <Route path="/points" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("타이머 배경 화면")).not.toBeInTheDocument();
    expect(screen.getByText("주소 /points?userId=7")).toBeInTheDocument();
  });
});
