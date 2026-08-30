import type { DeviceMotionSource } from "../deviceMotionSource";
import { createMotionSensorRelay } from "../motionSensorRelay";

/**
 * 공용 브리지 경로(소셜 탭·딥링크 join)의 센서 릴레이 — 센서 시작/정지, device-handling
 * 회신 통로 갱신, AppState 백그라운드 가드를 검증한다. 싱글룸 화면의 로컬 오버라이드
 * 경로는 여기 대상이 아니다(session-room 쪽 테스트 소관).
 */

type AppStateListener = (state: string) => void;

function createFakeSource() {
  let listener: ((active: boolean) => void) | null = null;
  const source: DeviceMotionSource = {
    start: jest.fn(),
    stop: jest.fn(),
    subscribe: jest.fn((l: (active: boolean) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
  };
  return { source, emit: (active: boolean) => listener?.(active) };
}

function createFakeAppState(initialState = "active") {
  let listener: AppStateListener | null = null;
  return {
    appState: {
      currentState: initialState,
      addEventListener: jest.fn((_type: "change", l: AppStateListener) => {
        listener = l;
        return {
          remove: () => {
            listener = null;
          },
        };
      }),
    },
    setState: (state: string) => listener?.(state),
  };
}

function motionMessage(enabled: boolean) {
  return { type: "motion-sensor", enabled, atMs: Date.now() } as const;
}

describe("createMotionSensorRelay", () => {
  it("enabled: true를 받으면 센서를 시작한다", () => {
    const { source } = createFakeSource();
    const { appState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it("enabled: false를 받으면 센서를 정지한다", () => {
    const { source } = createFakeSource();
    const { appState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    relay.handle(motionMessage(false), jest.fn());
    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it("센서 신호가 바뀌면 device-handling을 회신한다", () => {
    const { source, emit } = createFakeSource();
    const { appState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    const reply = jest.fn();
    relay.handle(motionMessage(true), reply);
    emit(true);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "device-handling", active: true }),
    );
  });

  it("회신은 가장 최근에 받은 reply 통로로 간다", () => {
    const { source, emit } = createFakeSource();
    const { appState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    const oldReply = jest.fn();
    const newReply = jest.fn();
    relay.handle(motionMessage(true), oldReply);
    relay.handle(motionMessage(true), newReply);
    emit(true);
    expect(oldReply).not.toHaveBeenCalled();
    expect(newReply).toHaveBeenCalledTimes(1);
  });

  it("백그라운드로 가면 센서를 정지한다", () => {
    const { source } = createFakeSource();
    const { appState, setState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    setState("background");
    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it("웹이 켜둔 상태였으면 포그라운드 복귀 시 센서를 재시작한다", () => {
    const { source } = createFakeSource();
    const { appState, setState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    setState("background");
    setState("active");
    expect(source.start).toHaveBeenCalledTimes(2);
  });

  it("백그라운드 상태에서 생성되면 enabled: true에도 센서를 켜지 않는다", () => {
    const { source } = createFakeSource();
    const { appState, setState } = createFakeAppState("background");
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    expect(source.start).not.toHaveBeenCalled();
    setState("active");
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it("백그라운드 중에 도착한 enabled: true는 센서를 켜지 않고 복귀를 기다린다", () => {
    const { source } = createFakeSource();
    const { appState, setState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    setState("background");
    relay.handle(motionMessage(true), jest.fn());
    expect(source.start).not.toHaveBeenCalled();
    setState("active");
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it("웹이 꺼둔 상태면 포그라운드 복귀에도 시작하지 않는다", () => {
    const { source } = createFakeSource();
    const { appState, setState } = createFakeAppState();
    const relay = createMotionSensorRelay(source, appState);
    relay.handle(motionMessage(true), jest.fn());
    relay.handle(motionMessage(false), jest.fn());
    setState("background");
    setState("active");
    expect(source.start).toHaveBeenCalledTimes(1);
  });
});
