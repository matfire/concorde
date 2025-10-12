import { createServer } from "@matfire/concorde/server";
import Pusher from "pusher";
import { registry } from "./common";

const pusher = new Pusher({
  host: "localhost",
  port: "6001",
  appId: "app-id",
  key: "app-key",
  secret: "app-secret",
  cluster: "eu",
});

export const server = createServer(registry, pusher);
