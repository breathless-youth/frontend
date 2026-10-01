/* global jest */
// worklets 0.10.1은 jest에서도 네이티브 모듈을 찾다가 loadUnpackers에서 멈춘다.
// 탭 화면은 스켈레톤을 거쳐 reanimated를, reanimated는 worklets를 불러오므로 탭 화면을 렌더하는 테스트가 전부 여기서 죽는다.
// 테스트마다 막지 않도록 모든 테스트 앞에서 공식 mock으로 바꿔 둔다.
jest.mock("react-native-worklets", () => jest.requireActual("react-native-worklets/src/mock"));
