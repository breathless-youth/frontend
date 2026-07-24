import * as SecureStore from "expo-secure-store";

import { getOrCreateDeviceId } from "../deviceId";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "0f8fad5b-d9cb-469f-a165-70867728950e"),
}));

const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;

describe("getOrCreateDeviceId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("저장된 UUID가 있으면 그대로 반환하고 새로 만들지 않는다", async () => {
    mockedGet.mockResolvedValue("11111111-2222-3333-4444-555555555555");

    await expect(getOrCreateDeviceId()).resolves.toBe("11111111-2222-3333-4444-555555555555");
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("저장된 UUID가 없으면 생성해서 저장 후 반환한다", async () => {
    mockedGet.mockResolvedValue(null);

    await expect(getOrCreateDeviceId()).resolves.toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(mockedSet).toHaveBeenCalledWith(
      "focuson.deviceId",
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
  });
});
