import type { PlaybackState } from "@spotify/web-api-ts-sdk";
import { firstOr } from "./utils";
import { selectImageIdFromList } from "./image";

export function formatPlayerStateForFrontend(state: PlaybackState) {
  if (!state || "show" in state.item) {
    // current spotify player state is a podcast, ignoring here
    return null;
  }

  const item = state.item;
  const firstArtist = firstOr(item.artists, {
    name: "Unknown Artist",
    uri: "spotify:artist",
    type: "artist",
  });
  const playerStatePayload = {
    context_uri: state.context?.uri ?? "spotify:collection",
    context_title: "Your Library",
    is_paused: !state.is_playing,
    is_paused_bool: !state.is_playing,
    playback_options: {
      repeat: state.repeat_state,
      shuffle: state.shuffle_state,
    },
    playback_position: state.progress_ms,
    playback_speed: 1,
    playing_remotely: true,
    remote_device_id: state.device.id ?? "",
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

export type FrontendFormattedPlayerState = ReturnType<
  typeof formatPlayerStateForFrontend
>;
