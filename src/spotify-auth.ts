import { log, spinner } from "@clack/prompts";
import { type AccessToken } from "@spotify/web-api-ts-sdk";

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
};
const generateRandomStringforPKCE = (length: number) => {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};
const base64encode = (input: ArrayBuffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

type CachedAuthData = {
  token?: AccessToken | null;
  time: number;
};

export const doAuthFlow = async () => {
  const cachedAuthData = Bun.file("./auth-data.json");
  const hasCachedAuthData = await cachedAuthData.exists();

  const doAuthAndWrite = async () => {
    const authData = await doInnerAuthFlow();
    await Bun.write(
      cachedAuthData,
      JSON.stringify({
        token: authData,
        time: Date.now(),
      })
    );

    return authData;
  };

  if (!hasCachedAuthData) {
    return doAuthAndWrite();
  }

  const authData = (await cachedAuthData.json()) as unknown as CachedAuthData;

  if (
    !authData.token?.access_token ||
    Date.now() > authData.time + authData.token?.expires_in * 1000
  ) {
    return doAuthAndWrite();
  }

  log.success("Using cached authentication data");

  return authData.token;
};

export const doInnerAuthFlow = () =>
  new Promise<AccessToken>(async (resolve, reject) => {
    const scope =
      "user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify user-top-read user-follow-read user-follow-modify user-read-recently-played";
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    const codeVerifier = generateRandomStringforPKCE(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    const redirectUri = "http://localhost:8888/callback";

    authUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: process.env.SPOTIFY_CLIENT_ID || "",
      scope,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
    }).toString();

    log.info("Spotify authentication URL: " + authUrl.toString());
    const authSpinner = spinner();
    authSpinner.start("Waiting for authentication");

    const authServer = Bun.serve({
      async fetch(req, server) {
        if (!req.url.includes("/callback")) {
          return new Response("Not found", { status: 404 });
        }

        const code = new URL(req.url).searchParams.get("code");

        if (!code) {
          authSpinner.stop();
          log.error("Authentication failed because no code was returned");
          return new Response("Authentication failed");
        }

        const accessTokenRequest = await fetch(
          "https://accounts.spotify.com/api/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: process.env.SPOTIFY_CLIENT_ID || "",
              code,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
              code_verifier: codeVerifier,
            }),
          }
        );
        const accessTokenResponse = await accessTokenRequest.json();
        if (accessTokenResponse.error) {
          authSpinner.stop();
          log.error("Authentication failed");
          return new Response("Authentication failed");
        }
        const accessToken = accessTokenResponse;
        authSpinner.stop("Authentication successful");
        resolve(accessToken);
        return new Response("Authentication successful");
      },
      port: 8888,
    });
  });
