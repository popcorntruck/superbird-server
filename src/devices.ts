import type { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { firstOr } from "./utils";

export async function getActiveConnectDevice(spotify: SpotifyApi) {
  const activeDevices = await spotify.player
    .getAvailableDevices()
    .then((devices) => devices.devices.filter((device) => device.is_active));

  return firstOr(activeDevices);
}

export async function getActiveConnectDeviceId(spotify: SpotifyApi) {
  const activeDevice = await getActiveConnectDevice(spotify);

  return activeDevice?.id ?? null;
}
