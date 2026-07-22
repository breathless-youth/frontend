import { formatDuration } from "../formatDuration";

describe("formatDuration", () => {
  it("formats seconds into hours and minutes", () => {
    expect(formatDuration(3661)).toBe("1시간 1분");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0시간 0분");
  });
});
