/**
 * 웹이 첫 화면을 보여도 된다고 알린 신호
 *
 * 홈은 온보딩으로 보낼지 판정한 뒤에 `launch-ready`를 보내고, 앱은 그때까지 스플래시를 유지한다.
 * 신호를 보내지 않는 이전 웹이나 로드 실패에서도 갇히지 않도록 상한이 지나면 기다림을 끝낸다.
 */
export const LAUNCH_READY_TIMEOUT_MS = 3000;

let ready = false;
const listeners = new Set<() => void>();

export function markLaunchReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of [...listeners]) listener();
  listeners.clear();
}

export function waitForLaunchReady(timeoutMs = LAUNCH_READY_TIMEOUT_MS): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    listeners.add(done);
  });
}

let promptsAllowed = false;
const promptListeners = new Set<() => void>();

/**
 * 시작 권한 창(ATT)을 띄워도 된다는 신호
 *
 * 스플래시가 걷히고 목표 문구 오버레이까지 끝난 뒤 `app/_layout.tsx`가 ATT를 시작하면서 켠다.
 * 웹이 요청한 알림 권한도 이 신호를 기다려서 스플래시나 오버레이 위에 OS 창이 뜨지 않는다.
 */
export function markStartPromptsAllowed(): void {
  if (promptsAllowed) return;
  promptsAllowed = true;
  for (const listener of [...promptListeners]) listener();
  promptListeners.clear();
}

export function waitForStartPrompts(): Promise<void> {
  if (promptsAllowed) return Promise.resolve();
  return new Promise((resolve) => promptListeners.add(resolve));
}

export function __resetLaunchReadyForTests(): void {
  ready = false;
  listeners.clear();
  promptsAllowed = false;
  promptListeners.clear();
}
