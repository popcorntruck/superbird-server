import type { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { firstOr } from "./utils";
import { getDevices } from "./queries";

export async function getActiveConnectDevice(spotify: SpotifyApi) {
  const activeDevices = await getDevices(spotify).then((devices) =>
    devices.devices.filter((device) => device.is_active)
  );

  return firstOr(activeDevices);
}

export async function getActiveConnectDeviceId(spotify: SpotifyApi) {
  const activeDevice = await getActiveConnectDevice(spotify);

  return activeDevice?.id ?? null;
}
