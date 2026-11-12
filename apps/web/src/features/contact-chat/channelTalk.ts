/**
 * 채널톡 웹 SDK 접근
 *
 * 공식 스니펫과 같은 방식으로 CDN 스크립트를 런타임에 불러오고, 쓰는 API만 타입을 적는다.
 * 채널톡 스크립트는 COEP require-corp 문서에서 차단되므로 COEP 예외인 상담 화면 문서에서만 이 모듈을 불러온다.
 */

const SCRIPT_SRC = "https://cdn.channel.io/plugin/ch-plugin-web.js";
// 플러그인 키가 잘못되면 SDK가 boot 콜백을 주지 않아 이 시간이 곧 실패 화면까지의 대기 시간이다.
const DEFAULT_BOOT_TIMEOUT_MS = 10_000;

type ChannelIOStub = ((...args: unknown[]) => void) & {
  q?: unknown[];
  c?: (args: unknown) => void;
};

declare global {
  interface Window {
    ChannelIO?: ChannelIOStub;
    ChannelIOInitialized?: boolean;
  }
}

export type ChannelLanguage = "ko" | "en" | "ja";
export type ChannelAppearance = "light" | "dark" | "system";
export type ChannelLoadFailure = "script" | "boot" | "no_key";

export type ChannelProfile = {
  appUserId: number | null;
  appVersion: string;
  platform: string;
  locale: string;
};

/**
 * 채널톡 boot에 넘기는 프로필
 *
 * 신원이 없으면 appUserId 항목이 없다.
 */
export type ChannelBootProfile = Omit<ChannelProfile, "appUserId"> & { appUserId?: number };

export type ChannelStartOptions = {
  pluginKey: string;
  language: ChannelLanguage;
  appearance: ChannelAppearance;
  profile: ChannelBootProfile;
  bootTimeoutMs?: number;
};

export interface ChannelSession {
  onShow(cb: () => void): void;
  onHide(cb: () => void): void;
  openChat(): void;
}

/**
 * 채널톡 시작 시도
 *
 * 화면을 벗어나면 cancel로 시도를 놓고, SDK에 넘긴 boot가 있으면 콜백을 기다리지 않고 바로 끈다.
 */
export interface ChannelAttempt {
  result: Promise<ChannelSession>;
  cancel(): void;
}

export class ChannelLoadError extends Error {
  readonly reason: "script" | "boot";

  constructor(reason: "script" | "boot") {
    super(`channel talk ${reason} failed`);
    this.name = "ChannelLoadError";
    this.reason = reason;
  }
}

/** 채널톡이 지원하지 않는 앱 언어의 영어 폴백 */
export function toChannelLanguage(locale: string): ChannelLanguage {
  return locale === "ko" || locale === "ja" ? locale : "en";
}

/** 앱 테마가 없을 때 기기 설정을 따르는 채널톡 테마 매핑 */
export function toChannelAppearance(datasetTheme: string | undefined): ChannelAppearance {
  return datasetTheme === "light" || datasetTheme === "dark" ? datasetTheme : "system";
}

/** 상담원에게 보일 익명 프로필 */
export function buildChannelProfile(input: ChannelProfile): ChannelBootProfile {
  const { appUserId, ...rest } = input;
  return appUserId === null ? rest : { appUserId, ...rest };
}

function call(...args: unknown[]): void {
  window.ChannelIO?.(...args);
}

const session: ChannelSession = {
  onShow: (cb) => call("onShowMessenger", cb),
  onHide: (cb) => call("onHideMessenger", cb),
  openChat: () => call("openChat"),
};

let scriptLoad: Promise<void> | null = null;

/**
 * 문서당 한 번만 붙이는 채널톡 스크립트
 *
 * 공식 스니펫과 같은 큐 스텁을 먼저 두어 SDK가 뜨기 전의 호출을 쌓아 둔다.
 * 받기에 실패하면 스크립트와 스텁을 걷어내 다음 시도가 처음부터 붙이게 한다.
 */
function loadScript(): Promise<void> {
  if (scriptLoad) return scriptLoad;
  const stub: ChannelIOStub = (...args) => stub.c?.(args);
  stub.q = [];
  stub.c = (args) => stub.q?.push(args);
  window.ChannelIO = stub;
  window.ChannelIOInitialized = true;
  scriptLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      delete window.ChannelIO;
      delete window.ChannelIOInitialized;
      scriptLoad = null;
      reject(new ChannelLoadError("script"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * 시작한 상담 수명
 *
 * generation은 진행 중인 시도의 번호이고, 번호가 바뀐 시도의 스크립트 로드·콜백·시간 초과는 아무 일도 하지 않는다.
 * bootIssued는 SDK에 boot를 넘긴 뒤 아직 끄지 않았는지를 뜻한다.
 * SDK는 문서에 하나뿐이라 새 시도는 남은 boot를 먼저 끄고 시작한다.
 */
let generation = 0;
let bootIssued = false;

function shutdownIssuedBoot(): void {
  if (!bootIssued) return;
  bootIssued = false;
  call("clearCallbacks");
  call("shutdown");
}

/**
 * 시도 끝내기
 *
 * 취소와 시간 초과가 같이 쓴다.
 * 번호를 올려 이 시도의 늦은 로드와 콜백을 무효로 만들고, 넘긴 boot가 있으면 바로 끈다.
 * 이미 끝났거나 더 새로운 시도가 있으면 false를 돌려준다.
 */
function endAttempt(mine: number): boolean {
  if (mine !== generation) return false;
  generation += 1;
  shutdownIssuedBoot();
  return true;
}

/**
 * 채널톡 상담 시작
 *
 * 공식 SDK는 잘못된 키에서도 boot 콜백을 부르지 않아 정해진 시간이 지나면 시도를 끝내고 boot 실패로 본다.
 */
export function startChannelTalk(options: ChannelStartOptions): ChannelAttempt {
  const mine = ++generation;
  shutdownIssuedBoot();
  const result = new Promise<ChannelSession>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (endAttempt(mine)) reject(new ChannelLoadError("boot"));
    }, options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS);
    loadScript().then(
      () => {
        if (mine !== generation) return;
        bootIssued = true;
        call(
          "boot",
          {
            pluginKey: options.pluginKey,
            language: options.language,
            appearance: options.appearance,
            profile: options.profile,
            hideChannelButtonOnBoot: true,
          },
          (error: unknown) => {
            if (mine !== generation) return;
            window.clearTimeout(timer);
            if (error) reject(new ChannelLoadError("boot"));
            else resolve(session);
          },
        );
      },
      () => {
        if (mine !== generation) return;
        window.clearTimeout(timer);
        reject(new ChannelLoadError("script"));
      },
    );
  });
  return {
    result,
    cancel: () => {
      endAttempt(mine);
    },
  };
}

/** 테스트 사이 모듈 상태 초기화 */
export function __resetChannelTalkForTests(): void {
  document.querySelectorAll(`script[src="${SCRIPT_SRC}"]`).forEach((el) => el.remove());
  delete window.ChannelIO;
  delete window.ChannelIOInitialized;
  scriptLoad = null;
  generation = 0;
  bootIssued = false;
}
