import type { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { firstOr } from "./utils";
import { selectImageIdFromList } from "./image";

export async function getFormattedPlayerState(
  spotifyApi: SpotifyApi,
  deviceId?: string
) {
  const currentSpotifyPlayerState = await spotifyApi.player.getPlaybackState();

  if (!currentSpotifyPlayerState || "show" in currentSpotifyPlayerState.item) {
    // current spotify player state is a podcast, ignoring here
    return;
  }

  const item = currentSpotifyPlayerState.item;
  const firstArtist = firstOr(item.artists, {
    name: "Unknown Artist",
    uri: "spotify:artist",
    type: "artist",
  });
  const playerStatePayload = {
    context_uri: currentSpotifyPlayerState.context?.uri ?? "spotify:collection",
    context_title: "Your Library",
    is_paused: !currentSpotifyPlayerState.is_playing,
    is_paused_bool: !currentSpotifyPlayerState.is_playing,
    playback_options: {
      repeat: currentSpotifyPlayerState.repeat_state,
      shuffle: currentSpotifyPlayerState.shuffle_state,
    },
    playback_position: currentSpotifyPlayerState.progress_ms,
    playback_speed: 1,
    playing_remotely: true,
    remote_device_id: deviceId ?? "",
    type: "track",
    track: {
      album: {
        name: item.album.name,
        type: item.album.type,
        uri: item.album.uri,
      },
      artist: {
        name: firstArtist.name ?? "Unknown Artist",
        uri: firstArtist.uri ?? "spotify:artist",
        type: firstArtist.type ?? "artist",
      },
      artists: item.artists.map((artist) => ({
        name: artist.name,
        uri: artist.uri,
        type: artist.type,
      })),
      duration_ms: item.duration_ms,
      image_id: selectImageIdFromList(item.album.images),
      is_episode: false,
      is_podcast: false,
      name: item.name,
      saved: true,
      uri: item.uri,
    },
  };

  return playerStatePayload;
}
