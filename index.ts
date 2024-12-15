import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import albumsList from "./data/albums_list.json";
import { doAuthFlow } from "./spotify-auth";

// ImageId -> Base64 Data
const imageBase64Cache = new Map<string, string>();

const useCachedOrFetchImage = async (imageId: string) => {
  if (imageBase64Cache.has(imageId)) {
    return imageBase64Cache.get(imageId) as string;
  }

  const imageReq = await fetch(`https://i.scdn.co/image/${imageId}`);

  console.log(`Fetching image ${imageId}`);

  // convert image to base64
  const imageBuffer = await imageReq.arrayBuffer();
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");

  imageBase64Cache.set(imageId, imageBase64);
  return imageBase64;
};

const spotifyAccessToken = await doAuthFlow();

const spotifyApi = SpotifyApi.withAccessToken(
  process.env.SPOTIFY_CLIENT_ID || "",
  spotifyAccessToken
);

const getFormattedPlayerState = async (deviceId?: string) => {
  const currentSpotifyPlayerState = await spotifyApi.player.getPlaybackState();

  if ("show" in currentSpotifyPlayerState.item) {
    // current spotify player state is a podcast, ignoring here
    return;
  }

  const item = currentSpotifyPlayerState.item;
  const firstArtist = item.artists[0];
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
      image_id: item.album.images[0].url.replace(
        "https://i.scdn.co/image/",
        ""
      ),
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
        if (msgJson.method === "com.spotify.superbird.get_home") {
          const children = albumsList.items.map((album) => ({
            title: album.album.name,
            subtitle: album.album.artists[0].name,
            uri: album.album.uri,
            image_id: album.album.images[0].url.replace(
              "https://i.scdn.co/image/",
              ""
            ),
          }));
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: msgJson.msgId,
              payload: {
                items: [
                  {
                    title: "Albums",
                    uri: "spotify:collection",
                    children: children,
                    total: children.length,
                  },
                ],
              },
            })
          );
        } else if (msgJson.method === "com.spotify.superbird.permissions") {
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
        } else if (msgJson.method === "com.spotify.get_image") {
          const imageBase64 = await useCachedOrFetchImage(msgJson.args.id);
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: msgJson.msgId,
              payload: {
                image_data: imageBase64,
              },
            })
          );
        } else if (msgJson.method === "com.spotify.get_thumbnail_image") {
          const imageBase64 = await useCachedOrFetchImage(msgJson.args.id);
          ws.send(
            JSON.stringify({
              type: "call_result",
              msgId: msgJson.msgId,
              payload: {
                image_data: imageBase64,
              },
            })
          );
        } else if (msgJson.method === "com.spotify.get_children_of_item") {
          const album = albumsList.items.find(
            (album) => album.album.uri === msgJson.args.parent_id
          );

          if (!album) {
            return;
          }

          const payload = {
            success: true,
            total: album.album.tracks.total,
            items: album.album.tracks.items.map((track) => ({
              id: track.id,
              image_id: album.album.images[0].url.replace(
                "https://i.scdn.co/image/",
                ""
              ),
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
              msgId: msgJson.msgId,
              payload,
            })
          );
        } else if (msgJson.method === "com.spotify.play_uri") {
          const firstAvailableDevice =
            await spotifyApi.player.getAvailableDevices();
          if (!firstAvailableDevice.devices.length) {
            return;
          }

          const deviceId = firstAvailableDevice.devices[0].id;

          if (!deviceId) {
            return;
          }
          console.log(`Playing ${msgJson.args.uri} on ${deviceId}`);
          await spotifyApi.player.startResumePlayback(
            deviceId,
            msgJson.args.contextURI,
            // [msgJson.args.uri],
            undefined,
            {
              uri: msgJson.args.skipToURI,
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
        } else if (msgJson.method === "com.spotify.set_playback_speed") {
          const isPaused = msgJson.args.playback_speed === 0;

          const firstAvailableDevice =
            await spotifyApi.player.getAvailableDevices();
          if (!firstAvailableDevice.devices.length) {
            return;
          }

          const deviceId = firstAvailableDevice.devices[0].id;

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
