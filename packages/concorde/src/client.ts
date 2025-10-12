import type Pusher from "pusher-js"; // <-- dev-time only; users bring their own version
import { safeValidate } from "./runtime.js";
import type {
  ChannelDef,
  ChannelSpecifier,
  EventNames,
  InType,
  OutType,
} from "./types.js";
import { getChannelDef, resolveChannelName } from "./utils.js";

export type TypedPusherClient<Registry> = {
  subscribe<Ch extends ChannelSpecifier<Registry>>(
    channelSpec: Ch,
  ): TypedChannel<Registry, Ch>;
  disconnect(): void;
};

export type TypedChannel<Registry, Ch extends ChannelSpecifier<Registry>> = {
  bind<Ev extends EventNames<Registry, Ch>>(
    event: Ev,
    handler: (payload: OutType<Registry, Ch, Ev>) => void,
  ): void;
  unbind<Ev extends EventNames<Registry, Ch>>(event: Ev): void;
  trigger<Ev extends EventNames<Registry, Ch>>(
    event: Ev,
    data: InType<Registry, Ch, Ev>,
  ): void;
};

export function createClient<Registry extends Record<string, ChannelDef>>(
  registry: Registry,
  pusher: Pusher.default,
): TypedPusherClient<Registry> {
  return {
    subscribe(channelSpec) {
      const resolvedChannelName = resolveChannelName(channelSpec);
      const raw = pusher.subscribe(resolvedChannelName);
      return {
        bind(event, handler) {
          const def = getChannelDef(registry, channelSpec);
          const schema = def.events[event];
          if (!schema)
            throw new Error(`Could not find schema for event ${event}`);
          raw.bind(event, async (rawPayload: unknown) => {
            const res = await safeValidate(schema, rawPayload);
            if (!res.success) {
              console.warn("Received invalid payload", res.issues);
              return;
            }
            handler(
              res.data as OutType<Registry, typeof channelSpec, typeof event>,
            );
          });
        },
        unbind(event) {
          raw.unbind(event);
        },
        async trigger(event, data) {
          const def = getChannelDef(registry, channelSpec);
          const schema = def.events[event];
          if (!schema)
            throw new Error(`Could not find schema for event ${event}`);
          const res = await safeValidate(schema, data);
          if (!res.success) {
            throw new Error(
              `Trying to send invalid data: ${JSON.stringify(res.issues)}`,
            );
          }
          raw.trigger(event, res.data);
        },
      };
    },
    disconnect() {
      pusher.disconnect();
    },
  };
}
