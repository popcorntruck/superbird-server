import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { doAuthFlow } from "./spotify-auth";
import { selectImageIdFromList } from "./image";
import { firstOr } from "./utils";
import { FixedResponseDeserializer } from "./fixed-response-deserializer";
import { createInterAppActionHandler } from "./handlers";

const spotifyAccessToken = await doAuthFlow();

const spotifyApi = SpotifyApi.withAccessToken(
  process.env.SPOTIFY_CLIENT_ID || "",
  spotifyAccessToken,
  {
    deserializer: new FixedResponseDeserializer(),
  }
);

const actionHandler = createInterAppActionHandler({ spotifyApi });
const getFormattedPlayerState = async (deviceId?: string) => {
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
};

const server = Bun.serve<{ authToken: string }>({
  fetch(req, server) {
    const success = server.upgrade(req);
    if (success) {
      // Bun automatically returns a 101 Switching Protocols
      // if the upgrade succeeds
      return undefined;
    }

    // handle HTTP request normally
    return new Response("Hello world!");
  },
  websocket: {
    // this is called when a message is received
    async open(ws) {
      ws.send(
        JSON.stringify({
          type: "remote_control_connection_status",
          payload: "finished",
        })
      );

      ws.send(
        JSON.stringify({
          type: "setup_status",
          payload: "finished",
        })
      );

      ws.send(
        JSON.stringify({
          type: "com.spotify.session_state",
          payload: {
            connection_type: "wlan",
            is_in_forced_offline_mode: false,
            is_logged_in: true,
            is_offline: false,
          },
        })
      );

      setTimeout(async () => {
        // send initial player state
        const playerStatePayload = await getFormattedPlayerState();
        ws.send(
          JSON.stringify({
            type: "com.spotify.superbird.player_state",
            payload: playerStatePayload,
          })
        );
      }, 1000);
    },
    async message(ws, message) {
      const msgJson = JSON.parse(message.toString());

      if (msgJson.method === "com.spotify.superbird.instrumentation.log") {
        return;
      }
      console.log(`Received ${message}`);
      // send back a message

      if (msgJson.type === "settings") {
        if (msgJson.key === "onboarding_status") {
          const response = JSON.stringify({
            type: "settings_response",
            payload: {
              key: "onboarding_status",
              value: "finished",
            },
          });
          ws.send(response);
        } else if (msgJson.key === "local-storage-data") {
          const response = JSON.stringify({
            type: "settings_response",
            payload: {
              key: "local-storage-data",
              value: "{}",
            },
          });
          ws.send(response);
        }
      }

      // Interapp Action
      if (msgJson.msgId) {
        await actionHandler.handle(ws, msgJson);
      }
    },
  },
  port: 8890,
});

console.log(`Listening on ${server.hostname}:${server.port}`);
