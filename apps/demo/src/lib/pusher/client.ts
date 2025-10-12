import { createClient } from "@matfire/concorde/client";
import Pusher from "pusher-js";
import { registry } from "./common";

const pusher = new Pusher("app-key", {
  wsHost: "localhost",
  wsPort: 6001,
  forceTLS: false,
  enabledTransports: ["ws"],
  cluster: "eu",
});

export const client = createClient(registry, pusher);
