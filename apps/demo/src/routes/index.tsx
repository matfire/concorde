import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { client } from "@/lib/pusher/client";
import { server } from "@/lib/pusher/server";

export const Route = createFileRoute("/")({
  component: App,
});

const triggerFromBackend = createServerFn().handler(async () => {
  await server.trigger("main", "ping", { name: "test" });
});

const triggerDynamicChannel = createServerFn().handler(async () => {
  await server.trigger(
    { template: "user-chat-{chatId}", params: { chatId: "123" } },
    "new-message",
    { message: "ping" },
  );
});

function App() {
  const trigger = useServerFn(triggerFromBackend);
  const triggerDynamic = useServerFn(triggerDynamicChannel);

  const [staticResponses, setStaticResponses] = useState<
    { date: Date; name: string }[]
  >([]);
  const [dynamicResponses, setDynamicResponses] = useState<
    { date: Date; message: string }[]
  >([]);
  const isSubbed = useRef(false);

  useEffect(() => {
    if (!isSubbed.current) {
      const mainChannel = client.subscribe("main");
      const chatChannel = client.subscribe({
        template: "user-chat-{chatId}",
        params: {
          chatId: "123",
        },
      });

      chatChannel.bind("new-message", (data) => {
        setDynamicResponses((old) => [...old, { ...data, date: new Date() }]);
      });

      mainChannel.bind("ping", (data) => {
        setStaticResponses((old) => [...old, { ...data, date: new Date() }]);
      });
      isSubbed.current = true;
    }
  }, []);

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>"Static" Channel</CardTitle>
          <CardDescription>
            This card will show responses from an event called "ping" from the
            "main" channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => trigger()}>Click</Button>
          <pre>
            {staticResponses
              .map((e) => `${e.name} received at ${e.date.toLocaleString()}`)
              .join("\n")}
          </pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>"Dynamic" Channel</CardTitle>
          <CardDescription>
            This card will show responses from an event called "new-message"
            from the dynamic (and typesafe) "user-chat-123" channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => triggerDynamic()}>Click</Button>
          <pre>
            {dynamicResponses
              .map((e) => `${e.message} received at ${e.date.toLocaleString()}`)
              .join("\n")}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
