import { RegistryBuilder } from "@matfire/concorde/registry";
import z from "zod";

export const registry = new RegistryBuilder()
  .channel("main", {
    ping: z.object({ name: z.string() }),
  })
  .channel("user-chat-{chatId}", {
    "new-message": z.object({ message: z.string() }),
  })
  .build();

export type Registry = typeof registry;
