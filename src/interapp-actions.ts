import type { ServerWebSocket } from "bun";
import {
  object,
  number,
  string,
  pipe,
  transform,
  any,
  boolean,
  literal,
  safeParse,
  type InferOutput,
  type GenericSchema,
} from "valibot";

export const NO_RESPONSE = Symbol("interapp action no response");

export type KnownInterAppActions =
  | "com.spotify.superbird.instrumentation.log"
  | "com.spotify.superbird.get_home"
  | "com.spotify.superbird.permissions"
  | "com.spotify.get_image"
  | "com.spotify.get_thumbnail_image"
  | "com.spotify.get_children_of_item"
  | "com.spotify.play_uri"
  | "com.spotify.set_playback_speed"
  | "com.spotify.superbird.tipsandtricks.get_tips_and_tricks";

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

type WS = ServerWebSocket<any>;

export class InterAppActionHandler<TContext = {}> {
  private handlers = new Map<
    KnownInterAppActions,
    {
      input?: GenericSchema;
      callback: (
        input: any,
        context: TContext,
        raw: {
          ws: WS;
          msg: unknown;
        }
      ) => any;
    }
  >();

  constructor(private context: TContext) {}

  public on<TInputSchema extends GenericSchema, TResult extends any>(
    action: KnownInterAppActions,
    options: {
      args?: TInputSchema;
      callback: (
        input: InferOutput<TInputSchema>,
        context: TContext,
        raw: {
          ws: WS;
          msg: unknown;
        }
      ) => TResult;
    }
  ) {
    this.handlers.set(action, {
      input: options.args,
      callback: options.callback,
    });
  }

  public async handle(ws: WS, msg: unknown): Promise<{ success: boolean }> {
    const asRequest = safeParse(interAppActionRequestSchema, msg);

    if (!asRequest.success) {
      return Promise.resolve({ success: false });
    }

    const action = asRequest.output.method;
    const handler = this.handlers.get(action);

    if (!handler) {
      console.log("No handler for action " + action);
      return Promise.resolve({ success: false });
    }

    const input = handler.input
      ? safeParse(handler.input, asRequest.output.args)
      : { output: asRequest.output.args, success: true };

    if (!input.success) {
      return Promise.resolve({ success: false });
    }

    const callbackResult = handler.callback(input.output, this.context, {
      ws,
      msg,
    });

    let result: unknown;

    if (callbackResult instanceof Promise) {
      result = await callbackResult;
    } else {
      result = callbackResult;
    }

    if (result === NO_RESPONSE) {
      return { success: true };
    }

    const reply = {
      type: "call_result",
      msgId: asRequest.output.msgId,
      payload: result,
    } satisfies InterAppActionSuccessResponse;

    ws.send(JSON.stringify(reply));

    return { success: true };
  }
}
