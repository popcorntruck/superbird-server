import {
  object,
  number,
  string,
  pipe,
  transform,
  any,
  boolean,
  literal,
  type InferOutput,
} from "valibot";

export type KnownInterAppActions =
  | "com.spotify.superbird.instrumentation.log"
  | "com.spotify.superbird.get_home"
  | "com.spotify.superbird.permissions"
  | "com.spotify.get_image"
  | "com.spotify.get_thumbnail_image"
  | "com.spotify.get_children_of_item"
  | "com.spotify.play_uri"
  | "com.spotify.set_playback_speed";

const transformAsInterAppAction = (action: string): KnownInterAppActions => {
  return action as KnownInterAppActions;
};

export const interAppActionRequestSchema = object({
  msgId: number(),
  method: pipe(string(), transform(transformAsInterAppAction)),
  args: any(),
  userAction: boolean(),
});
export type InterAppActionRequest = InferOutput<
  typeof interAppActionRequestSchema
>;
export const interAppActionSuccessResponseSchema = object({
  type: literal("call_result"),
  msgId: number(),
  payload: any(),
});

export type InterAppActionSuccessResponse = InferOutput<
  typeof interAppActionSuccessResponseSchema
>;

export class InterAppActionHandler {}
