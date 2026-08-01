import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HomePage } from "../HomePage";

describe("HomePage", () => {
  it("renders the service name and entry link", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("FocusMakers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /스터디룸 입장/ })).toBeInTheDocument();
  });
});
