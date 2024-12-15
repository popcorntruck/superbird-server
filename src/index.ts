import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { doAuthFlow } from "./spotify-auth";
import { getImageBase64, selectImageIdFromList } from "./image";
import { firstOr, mapFirstOr } from "./utils";
import { getActiveConnectDeviceId } from "./devices";
import type { InterAppActionRequest } from "./interapp-actions";
import { getAlbum, getAlbumsList } from "./queries";

const spotifyAccessToken = await doAuthFlow();

const spotifyApi = SpotifyApi.withAccessToken(
  process.env.SPOTIFY_CLIENT_ID || "",
  spotifyAccessToken
);

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
        const action = msgJson as InterAppActionRequest;
        if (action.method === "com.spotify.superbird.get_home") {
          const savedAlbums = await getAlbumsList(spotifyApi);
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
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: action.msgId,
              payload: {
                items: [
                  {
                    title: "Albums",
                    uri: "spotify:collection:albums",
                    children: children,
                    total: savedAlbums.total,
                  },
                ],
              },
            })
          );
        } else if (action.method === "com.spotify.superbird.permissions") {
          // ws.send(
          //   JSON.stringify({
          //     type: "call_result",
          //     msgId: msgJson.msgId,
          //     payload: {
          //       can_use_superbird: true,
          //       can_play_on_demand: false,
          //     },
          //   })
          // );
        } else if (action.method === "com.spotify.get_image") {
          const imageBase64 = await getImageBase64(action.args.id);
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: action.msgId,
              payload: {
                image_data: imageBase64,
              },
            })
          );
        } else if (action.method === "com.spotify.get_thumbnail_image") {
          const imageBase64 = await getImageBase64(action.args.id);
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: action.msgId,
              payload: {
                image_data: imageBase64,
              },
            })
          );
        } else if (action.method === "com.spotify.get_children_of_item") {
          const album = await getAlbum(spotifyApi, action.args.parent_id);

          if (!album) {
            return;
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
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: action.msgId,
              payload,
            })
          );
        } else if (action.method === "com.spotify.play_uri") {
          const deviceId = await getActiveConnectDeviceId(spotifyApi);

          if (!deviceId) {
            return;
          }
          console.log(`Playing ${action.args.uri} on ${deviceId}`);
          await spotifyApi.player.startResumePlayback(
            deviceId,
            action.args.contextURI,
            // [action.args.uri],
            undefined,
            {
              uri: action.args.skipToURI,
            }
          );

          // wait for connect state to update
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const playerStatePayload = await getFormattedPlayerState(deviceId);

          ws.send(
            JSON.stringify({
              type: "com.spotify.superbird.player_state",
              payload: playerStatePayload,
            })
          );
        } else if (action.method === "com.spotify.set_playback_speed") {
          const isPaused = action.args.playback_speed === 0;
          const deviceId = await getActiveConnectDeviceId(spotifyApi);

          if (!deviceId) {
            return;
          }

          if (isPaused) {
            await spotifyApi.player.pausePlayback(deviceId);
          } else {
            await spotifyApi.player.startResumePlayback(deviceId);
          }

          // wait for connect state to update
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const playerStatePayload = await getFormattedPlayerState(deviceId);

          ws.send(
            JSON.stringify({
              type: "com.spotify.superbird.player_state",
              payload: playerStatePayload,
            })
          );
        }
      }
    },
  },
  port: 8890,
});

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at: Promise", p, "reason:", reason);
});

console.log(`Listening on ${server.hostname}:${server.port}`);
