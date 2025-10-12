import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ChannelDef } from "./types.js";

export class RegistryBuilder<
  TChannels extends Record<string, ChannelDef> = {},
> {
  private channels: TChannels;

  constructor(channels = {} as TChannels) {
    this.channels = channels;
  }

  channel<Name extends string, Events extends Record<string, StandardSchemaV1>>(
    name: Name,
    events: Events,
  ): RegistryBuilder<TChannels & Record<Name, ChannelDef<Name, Events>>> {
    const newChannels = {
      ...this.channels,
      [name]: { name, events } as ChannelDef<Name, Events>,
    } as TChannels & Record<Name, ChannelDef<Name, Events>>;

    return new RegistryBuilder(newChannels);
  }

  build(): TChannels {
    return this.channels;
  }
}
