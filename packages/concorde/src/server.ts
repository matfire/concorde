import type PusherServer from "pusher"; // <-- dev-time only
import { safeValidate } from "./runtime.js";
import type {
  ChannelDef,
  ChannelSpecifier,
  EventNames,
  InType,
} from "./types.js";
import { getChannelDef, resolveChannelName } from "./utils.js";

export type TypedPusherServer<Registry> = {
  trigger<
    Ch extends ChannelSpecifier<Registry>,
    Ev extends EventNames<Registry, Ch>,
  >(
    channel: Ch | Ch[],
    event: Ev,
    data: InType<Registry, Ch, Ev>,
  ): Promise<PusherServer.Response>;
};

export function createServer<Registry extends Record<string, ChannelDef>>(
  registry: Registry,
  pusher: PusherServer,
): TypedPusherServer<Registry> {
  return {
    async trigger(channels, event, data) {
      const firstChannel = Array.isArray(channels) ? channels[0] : channels;
      if (!firstChannel) throw new Error("No channels provided");

      // Get the channel definition from the first channel (all channels should have same schema)
      const singleDef = getChannelDef(registry, firstChannel);
      const schema = singleDef.events[event];
      if (!schema) throw new Error(`Unknown event ${String(event)}`);

      // Validate the data
      const res = await safeValidate(schema, data);
      if (!res.success) {
        return Promise.reject(
          new Error(
            `Trying to send invalid data: ${JSON.stringify(res.issues)}`,
          ),
        );
      }

      // Resolve channel specifiers to actual channel names
      const resolvedChannels = Array.isArray(channels)
        ? channels.map((ch) => resolveChannelName(ch))
        : resolveChannelName(channels);

      return pusher.trigger(resolvedChannels, event, res.data);
    },
  };
}
