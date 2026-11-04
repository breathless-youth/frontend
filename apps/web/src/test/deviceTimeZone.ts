import { onTestFinished, vi } from "vitest";

/**
 * 기기 시간대 바꾸기
 *
 * 앱은 기기 시간대를 `Intl.DateTimeFormat#resolvedOptions`에서 읽는다.
 * 테스트가 실패해도 다음 테스트로 새지 않게 그 테스트가 끝나면 되돌린다.
 */
export function mockDeviceTimeZone(timeZone: string | undefined): void {
  const real = Intl.DateTimeFormat().resolvedOptions();
  const spy = vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockReturnValue({ ...real, timeZone: timeZone as string });
  onTestFinished(() => {
    spy.mockRestore();
  });
}
