import type { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { InterAppActionHandler, NO_RESPONSE } from "./interapp-actions";
import { getAlbum, getAlbumsList } from "./queries";
import { getImageBase64, selectImageIdFromList } from "./image";
import { mapFirstOr } from "./utils";
import * as v from "valibot";
import { getActiveConnectDeviceId } from "./devices";
import { sleep } from "bun";
import type { PlayerStateManager } from "./player-state-manager";

export function createInterAppActionHandler({
  spotifyApi,
  playerStateManager,
}: {
  spotifyApi: SpotifyApi;
  playerStateManager: PlayerStateManager;
}) {
  const actionHandler = new InterAppActionHandler({
    spotifyApi,
    playerStateManager,
  });

  actionHandler.on("com.spotify.superbird.get_home", {
    async callback(input, context) {
      const savedAlbums = await getAlbumsList(context.spotifyApi);
      const children = savedAlbums.items.map((album) => ({
        title: album.album.name,
        subtitle: mapFirstOr(
          album.album.artists,
          (artist) => artist.name,
          "Unknown Artist"
        ),
        uri: album.album.uri,
        image_id: selectImageIdFromList(album.album.images),
      }));

      return {
        items: [
          {
            title: "Albums",
            uri: "spotify:collection:albums",
            children: children,
            total: savedAlbums.total,
          },
        ],
      };
    },
  });

  actionHandler.on("com.spotify.get_children_of_item", {
    args: v.object({
      parent_id: v.string(),
    }),
    async callback(input, context) {
      // the parent id is a uri, it isn't always an album
      const album = await getAlbum(spotifyApi, input.parent_id);

      if (!album) {
        return NO_RESPONSE;
      }

      const payload = {
        success: true,
        total: album.tracks.total,
        items: album.tracks.items.map((track) => ({
          id: track.id,
          image_id: selectImageIdFromList(album.images),

          playable: true,
          subtitle: track.artists.map((artist) => artist.name).join(", "),
          title: track.name,
          uri: track.uri,
          available_offline: false,
          content_description: "",
          has_children: false,
          metadata: {
            is_explicit_content: track.explicit,
            duration_ms: track.duration_ms,
          },
        })),
      };

      return payload;
    },
  });

  actionHandler.on("com.spotify.get_image", {
    args: v.object({
      id: v.string(),
    }),
    async callback(input, context) {
      const imageBase64 = await getImageBase64(input.id);

      return {
        image_data: imageBase64,
      };
    },
  });

  actionHandler.on("com.spotify.get_thumbnail_image", {
    args: v.object({
      id: v.string(),
    }),
    async callback(input, context) {
      const imageBase64 = await getImageBase64(input.id);

      return {
        image_data: imageBase64,
      };
    },
  });

  actionHandler.on("com.spotify.superbird.permissions", {
    callback(input, context) {
      return NO_RESPONSE;

      return {
        can_use_superbird: true,
        can_play_on_demand: false,
      };
    },
  });

  actionHandler.on("com.spotify.play_uri", {
    args: v.object({
      uri: v.string(),
      contextURI: v.string(),
      skipToURI: v.nullish(v.string()),
    }),
    async callback(input, context, { ws }) {
      await context.playerStateManager.playUri({
        contextUri: input.contextURI,
        skipToUri: input.skipToURI,
      });

      return NO_RESPONSE;
    },
  });

  actionHandler.on("com.spotify.set_playback_speed", {
    args: v.object({
      playback_speed: v.number(),
    }),
    async callback(input, context, { ws }) {
      const isPaused = input.playback_speed === 0;

      await context.playerStateManager.setIsPlaying(!isPaused);

      return NO_RESPONSE;
    },
  });

  return actionHandler;
}
