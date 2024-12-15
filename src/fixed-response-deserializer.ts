import { DefaultResponseDeserializer } from "@spotify/web-api-ts-sdk";

export class FixedResponseDeserializer extends DefaultResponseDeserializer {
  deserialize<TReturnType>(response: Response): Promise<TReturnType> {
    const url = new URL(response.url);

    /**
     * These urls don't return json, pretty sure they just return the ack_id
     * so the methods throw whenever they are called, so here we just return
     * an empty object
     */
    const brokenUrls = ["/v1/me/player/play", "/v1/me/player/pause"];

    if (brokenUrls.includes(url.pathname)) {
      return Promise.resolve({} as TReturnType);
    }

    return super.deserialize(response);
  }
}
