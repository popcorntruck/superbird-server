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
      /* 5 minutes until cache gets invalid
       * Optional, defaults to Infinity */
      ttl: 120_000,
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
      /* 5 minutes until cache gets invalid
       * Optional, defaults to Infinity */
      ttl: 120_000,
    },
    verboseReporter()
  );
}
