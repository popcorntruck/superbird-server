import type { PlaybackState, SpotifyApi } from "@spotify/web-api-ts-sdk";
import { diff } from "deep-object-diff";
import {
  formatPlayerStateForFrontend,
  type FrontendFormattedPlayerState,
} from "./player-state";
import mitt, { type Emitter } from "mitt";

export type PlayerStateEvents = {
  playerStateChanged: {
    state: PlaybackState;
    formatted: FrontendFormattedPlayerState;
  };
};

export class PlayerStateManager {
  private scheduler = new RefetchScheduler(1500);
  private currentPlaybackState: PlaybackState | null = null;
  private lastPlaybackState: PlaybackState | null = null;

  private _events = mitt<PlayerStateEvents>();

  constructor(private spotifyApi: SpotifyApi) {
    this.scheduler.onRefetch(() => this.refetchPlayerState());
    this.scheduler.start();
  }

  get events() {
    return this._events;
  }

  get playerState() {
    return this.currentPlaybackState ?? null;
  }

  get formattedPlayerState() {
    return this.playerState
      ? formatPlayerStateForFrontend(this.playerState)
      : null;
  }

  public async setIsPlaying(isPlaying: boolean) {
    const deviceId = this.playerState?.device.id;

    if (!deviceId) {
      return;
    }

    if (isPlaying) {
      await this.spotifyApi.player.startResumePlayback(deviceId);
    } else {
      await this.spotifyApi.player.pausePlayback(deviceId);
    }

    this.scheduler.refetchNow();
  }

  public async playUri({
    skipToUri,
    contextUri,
  }: {
    skipToUri?: string | null;
    contextUri: string;
  }) {
    const deviceId = this.playerState?.device.id;

    if (!deviceId) {
      return;
    }

    await this.spotifyApi.player.startResumePlayback(
      deviceId,
      contextUri,
      undefined,
      skipToUri ? { uri: skipToUri } : undefined
    );

    this.scheduler.refetchNow();
  }

  private async refetchPlayerState() {
    const playerState = await this.spotifyApi.player.getPlaybackState();

    if (playerState && playerState.item) {
      this.lastPlaybackState = this.currentPlaybackState;
      this.currentPlaybackState = playerState;

      if (this.lastPlaybackState) {
        console.log(diff(this.lastPlaybackState, this.currentPlaybackState));
      }

      if (this.didPlayerStateChange()) {
        console.log(
          "player state changed from uri",
          this.lastPlaybackState?.item?.uri,
          "to",
          this.currentPlaybackState?.item?.uri
        );

        this._events.emit("playerStateChanged", {
          state: playerState,
          formatted: this.formattedPlayerState,
        });
      }
    }
  }

  private didPlayerStateChange() {
    if (!this.currentPlaybackState || !this.lastPlaybackState) {
      return true;
    }

    return (
      this.currentPlaybackState.item?.uri !==
        this.lastPlaybackState.item?.uri ||
      this.lastPlaybackState.is_playing !== this.currentPlaybackState.is_playing
    );
  }
}

class RefetchScheduler {
  private intervalId: NodeJS.Timer | null = null;
  private emitter: Emitter<{
    refetch: undefined;
  }>;

  constructor(private defaultInterval: number) {
    if (defaultInterval <= 0) {
      throw new Error("defaultInterval must be greater than 0");
    }
    this.emitter = mitt();
  }

  // Start the refetch schedule
  public start() {
    this.stop(); // Ensure no multiple intervals
    this.scheduleNextRefetch(this.defaultInterval);
  }

  // Stop the refetch schedule
  public stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  // Immediately emit refetch and reschedule the next one
  public refetchNow() {
    try {
      this.emitRefetch();
    } catch (error) {
      console.error("Error during refetchNow:", error);
    } finally {
      this.scheduleNextRefetch(this.defaultInterval);
    }
  }

  // Subscribe to refetch events
  public onRefetch(listener: () => void) {
    this.emitter.on("refetch", () => {
      try {
        listener();
      } catch (error) {
        console.error("Error in refetch listener:", error);
      }
    });
  }

  // Delay the next refetch without triggering one
  public delayNextRefetch() {
    this.scheduleNextRefetch(this.defaultInterval);
  }

  // Emit the refetch event
  private emitRefetch() {
    this.emitter.emit("refetch");
  }

  // Schedule the next refetch event
  private scheduleNextRefetch(interval: number) {
    console.log("scheduleNextRefetch", interval);
    this.stop(); // Clear existing interval
    this.intervalId = setTimeout(() => {
      try {
        this.emitRefetch();
      } catch (error) {
        console.error("Error during scheduled refetch:", error);
      } finally {
        this.scheduleNextRefetch(this.defaultInterval); // Reschedule
      }
    }, interval);

    console.log("scheduleNextRefetch done", this.intervalId);
  }
}
