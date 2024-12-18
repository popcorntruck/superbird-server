import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { doAuthFlow } from "./spotify-auth";
import { FixedResponseDeserializer } from "./fixed-response-deserializer";
import { createInterAppActionHandler } from "./handlers";
import { PlayerStateManager } from "./player-state-manager";

const spotifyAccessToken = await doAuthFlow();

const spotifyApi = SpotifyApi.withAccessToken(
  process.env.SPOTIFY_CLIENT_ID || "",
  spotifyAccessToken,
  {
    deserializer: new FixedResponseDeserializer(),
  }
);

const playerStateManager = new PlayerStateManager(spotifyApi);
const actionHandler = createInterAppActionHandler({
  spotifyApi,
  playerStateManager,
});

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
        const playerStatePayload = playerStateManager.formattedPlayerState;
        ws.send(
          JSON.stringify({
            type: "com.spotify.superbird.player_state",
            payload: playerStatePayload,
          })
        );
      }, 1000);

      playerStateManager.events.on(
        "playerStateChanged",
        ({ state, formatted }) => {
          console.log("playerStateChanged", state.item.uri);
          ws.send(
            JSON.stringify({
              type: "com.spotify.superbird.player_state",
              payload: formatted,
            })
          );
        }
      );
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
