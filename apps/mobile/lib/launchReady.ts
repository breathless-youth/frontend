/**
 * 웹이 첫 화면을 보여도 된다고 알린 신호
 *
 * 홈은 온보딩으로 보낼지 판정한 뒤에 `launch-ready`를 보내고, 앱은 그때까지 스플래시를 유지한다.
 * 신호를 보내지 않는 이전 웹이나 로드 실패에서도 갇히지 않도록 상한이 지나면 기다림을 끝낸다.
 * 상한은 보이는 탭의 웹뷰가 뜬 때부터 센다. 새 계정은 웹뷰가 뜨기 전에 가입 응답을 기다려서,
 * 기다리기 시작한 때부터 세면 신호가 오기 전에 스플래시가 걷혀 홈이 비친다.
 * 가입이 끝나지 않아 웹뷰가 뜨지 않아도 전체 상한이 지나면 걷는다.
 */
export const LAUNCH_READY_TIMEOUT_MS = 3000;
export const LAUNCH_READY_MAX_WAIT_MS = 10000;

let ready = false;
const listeners = new Set<() => void>();
let loadStarted = false;
const loadListeners = new Set<() => void>();

export function markLaunchLoadStarted(): void {
  if (loadStarted) return;
  loadStarted = true;
  for (const listener of [...loadListeners]) listener();
  loadListeners.clear();
}

export function markLaunchReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of [...listeners]) listener();
  listeners.clear();
}

export function waitForLaunchReady(): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = () => {
      timer = setTimeout(done, LAUNCH_READY_TIMEOUT_MS);
    };
    const done = () => {
      clearTimeout(timer);
      clearTimeout(maxTimer);
      listeners.delete(done);
      loadListeners.delete(startTimer);
      resolve();
    };
    const maxTimer = setTimeout(done, LAUNCH_READY_MAX_WAIT_MS);
    listeners.add(done);
    if (loadStarted) startTimer();
    else loadListeners.add(startTimer);
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
  loadStarted = false;
  loadListeners.clear();
  promptsAllowed = false;
  promptListeners.clear();
}
