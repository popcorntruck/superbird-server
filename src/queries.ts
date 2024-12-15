import { cachified, verboseReporter } from "@epic-web/cachified";
import type { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { lruCache } from "./cache";
import { idFromUri } from "./utils";

const MARKET = "US";

export function getAlbumsList(spotify: SpotifyApi) {
  return cachified(
    {
      key: "albums_list",
      cache: lruCache,
      async getFreshValue() {
        return spotify.currentUser.albums.savedAlbums(25, undefined, MARKET);
      },
      /* 15 minutes until cache gets invalid
       * Optional, defaults to Infinity */
      ttl: 900_000,
    },
    verboseReporter()
  );
}

export function getAlbum(spotify: SpotifyApi, uri: string) {
  return cachified(
    {
      key: `album_${uri}`,
      cache: lruCache,
      async getFreshValue() {
        return spotify.albums.get(idFromUri(uri), MARKET);
      },
      /* 15 minutes until cache gets invalid
       * Optional, defaults to Infinity */
      ttl: 900_000,
    },
    verboseReporter()
  );
}

export function getDevices(spotify: SpotifyApi) {
  return cachified(
    {
      key: `devices`,
      cache: lruCache,
      async getFreshValue() {
        return spotify.player.getAvailableDevices();
      },
      /* 30 seconds until cache gets invalid
       * This cache should be overwritten if the `device` field is different when we request the player state
       */
      ttl: 30 * 1000,
    },
    verboseReporter()
  );
}
