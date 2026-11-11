import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";

// 서버 API가 나오기 전이라 플래그를 켠 문서도 메모리 가짜 경계를 쓴다.
// 상점·홈·설정이 같은 잔액을 보도록 문서마다 하나만 만들어 나눠 쓴다.
export const appPointsGateway = createFakePointsGateway("default");
