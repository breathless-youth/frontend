import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AlarmSoundToggle } from "../components/AlarmSoundToggle";

describe("AlarmSoundToggle", () => {
  it("켜져 있으면 종, 꺼져 있으면 빗금 친 종을 그린다", () => {
    const { rerender } = render(<AlarmSoundToggle soundOn onChangeSoundOn={() => {}} />);
    expect(screen.getByTestId("icon-bell")).toBeInTheDocument();

    rerender(<AlarmSoundToggle soundOn={false} onChangeSoundOn={() => {}} />);
    expect(screen.getByTestId("icon-bell-off")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-bell")).not.toBeInTheDocument();
  });
});
