import { type } from "arktype";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../client.js";
import { createServer } from "../server.js";
import type { ChannelDef } from "../types.js";
import {
  createMockPusherClient,
  createMockPusherServer,
  waitForAsync,
} from "./test-utils.js";

// Registry with both static and dynamic channels
const dynamicTestRegistry = {
  // Static channels (existing behavior)
  "global-notifications": {
    name: "global-notifications" as const,
    events: {
      alert: type({
        message: "string",
        level: "'info' | 'warning' | 'error'",
      }),
    },
  },

  // Dynamic channels with single parameter
  "user-{userId}": {
    name: "user-{userId}" as const,
    events: {
      "profile-update": type({
        userId: "string",
        data: "object",
      }),
      notification: type({
        message: "string",
        timestamp: "number",
      }),
    },
  },

  // Dynamic channels with multiple parameters
  "room-{roomId}-user-{userId}": {
    name: "room-{roomId}-user-{userId}" as const,
    events: {
      message: type({
        content: "string",
        timestamp: "number",
        senderId: "string",
      }),
      typing: type({
        isTyping: "boolean",
      }),
    },
  },

  // Dynamic channels with different parameter patterns
  "session-{sessionId}": {
    name: "session-{sessionId}" as const,
    events: {
      "state-change": type({
        state: "'active' | 'inactive' | 'expired'",
        timestamp: "number",
      }),
    },
  },
} as const satisfies Record<string, ChannelDef>;

describe("Dynamic Channel Tests", () => {
  let mockPusher: ReturnType<typeof createMockPusherClient>;
  let mockPusherServer: ReturnType<typeof createMockPusherServer>;

  beforeEach(() => {
    mockPusher = createMockPusherClient();
    mockPusherServer = createMockPusherServer();
  });

  describe("Client Dynamic Channel Subscription", () => {
    it("should subscribe to dynamic channel with single parameter", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("user-123");
      expect(channel).toBeDefined();
    });

    it("should subscribe to dynamic channel with multiple parameters", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "room-{roomId}-user-{userId}",
        params: { roomId: "456", userId: "123" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("room-456-user-123");
      expect(channel).toBeDefined();
    });

    it("should still support static channel subscription", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe("global-notifications");

      expect(mockPusher.subscribe).toHaveBeenCalledWith("global-notifications");
      expect(channel).toBeDefined();
    });

    it("should throw error for missing parameters", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      expect(() => {
        client.subscribe({
          template: "user-{userId}",
          params: {}, // Missing userId
        } as any);
      }).toThrow("Missing parameter: userId");
    });

    it("should throw error for unknown template", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      expect(() => {
        const channel = client.subscribe({
          template: "unknown-{param}",
          params: { param: "value" },
        } as any);
        // Try to bind an event to trigger the error
        channel.bind("some-event" as any, () => {});
      }).toThrow("Could not find channel template unknown-{param}");
    });
  });

  describe("Client Dynamic Channel Events", () => {
    it("should bind events on dynamic channels", async () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);
      const handler = vi.fn();

      const channel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      channel.bind("notification", handler);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.bind).toHaveBeenCalledWith(
        "notification",
        expect.any(Function),
      );
    });

    it("should trigger events on dynamic channels", async () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      const notificationData = {
        message: "Hello user!",
        timestamp: Date.now(),
      };

      await channel.trigger("notification", notificationData);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledWith(
        "notification",
        notificationData,
      );
    });

    it("should unbind events on dynamic channels", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      channel.unbind("notification");

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.unbind).toHaveBeenCalledWith("notification");
    });

    it("should handle different events on multi-parameter channels", async () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "room-{roomId}-user-{userId}",
        params: { roomId: "456", userId: "123" },
      });

      const messageData = {
        content: "Hello room!",
        timestamp: Date.now(),
        senderId: "123",
      };

      await channel.trigger("message", messageData);

      const typingData = { isTyping: true };
      await channel.trigger("typing", typingData);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledWith("message", messageData);
      expect(mockChannel?.trigger).toHaveBeenCalledWith("typing", typingData);
    });
  });

  describe("Server Dynamic Channel Triggers", () => {
    it("should trigger to single dynamic channel", async () => {
      const server = createServer(dynamicTestRegistry, mockPusherServer as any);

      await server.trigger(
        {
          template: "user-{userId}",
          params: { userId: "123" },
        },
        "notification",
        {
          message: "Server notification",
          timestamp: Date.now(),
        },
      );

      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        "user-123",
        "notification",
        expect.objectContaining({
          message: "Server notification",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should trigger to multiple dynamic channels", async () => {
      const server = createServer(dynamicTestRegistry, mockPusherServer as any);

      await server.trigger(
        [
          {
            template: "user-{userId}",
            params: { userId: "123" },
          },
          {
            template: "user-{userId}",
            params: { userId: "456" },
          },
        ],
        "notification",
        {
          message: "Broadcast notification",
          timestamp: Date.now(),
        },
      );

      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        ["user-123", "user-456"],
        "notification",
        expect.objectContaining({
          message: "Broadcast notification",
          timestamp: expect.any(Number),
        }),
      );
    });

    it("should trigger to static channel", async () => {
      const server = createServer(dynamicTestRegistry, mockPusherServer as any);

      await server.trigger("global-notifications", "alert", {
        message: "Global alert",
        level: "warning",
      });

      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        "global-notifications",
        "alert",
        {
          message: "Global alert",
          level: "warning",
        },
      );
    });

    it("should trigger to mixed static and dynamic channels with compatible events", async () => {
      // Create a registry where both static and dynamic channels have the same event
      const mixedRegistry = {
        "global-notifications": {
          name: "global-notifications" as const,
          events: {
            alert: type({
              message: "string",
              level: "'info' | 'warning' | 'error'",
            }),
          },
        },
        "user-{userId}": {
          name: "user-{userId}" as const,
          events: {
            alert: type({
              message: "string",
              level: "'info' | 'warning' | 'error'",
            }),
          },
        },
      } as const satisfies Record<string, ChannelDef>;

      const server = createServer(mixedRegistry, mockPusherServer as any);

      await server.trigger(
        [
          "global-notifications",
          {
            template: "user-{userId}",
            params: { userId: "123" },
          },
        ],
        "alert",
        {
          message: "Mixed broadcast",
          level: "info",
        },
      );

      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        ["global-notifications", "user-123"],
        "alert",
        expect.objectContaining({
          message: "Mixed broadcast",
          level: "info",
        }),
      );
    });

    it("should validate data before triggering dynamic channels", async () => {
      const server = createServer(dynamicTestRegistry, mockPusherServer as any);

      await expect(
        server.trigger(
          {
            template: "user-{userId}",
            params: { userId: "123" },
          },
          "notification",
          {
            message: 123, // Should be string
            timestamp: "invalid", // Should be number
          } as any,
        ),
      ).rejects.toThrow("Trying to send invalid data");

      expect(mockPusherServer.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Dynamic Channel Parameter Validation", () => {
    it("should validate all required parameters are provided", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      expect(() => {
        client.subscribe({
          template: "room-{roomId}-user-{userId}",
          params: { roomId: "456" }, // Missing userId
        } as any);
      }).toThrow("Missing parameter: userId");
    });

    it("should handle parameters with special characters", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "user-123-abc" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("user-user-123-abc");
    });

    it("should handle empty string parameters", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      const channel = client.subscribe({
        template: "session-{sessionId}",
        params: { sessionId: "" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("session-");
    });
  });

  describe("Integration with Static Channels", () => {
    it("should support both static and dynamic channels in same client", () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);

      // Subscribe to static channel
      const staticChannel = client.subscribe("global-notifications");

      // Subscribe to dynamic channel
      const dynamicChannel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("global-notifications");
      expect(mockPusher.subscribe).toHaveBeenCalledWith("user-123");
      expect(mockPusher.subscribe).toHaveBeenCalledTimes(2);
    });

    it("should maintain separate event handlers for different channel types", async () => {
      const client = createClient(dynamicTestRegistry, mockPusher as any);
      const staticHandler = vi.fn();
      const dynamicHandler = vi.fn();

      const staticChannel = client.subscribe("global-notifications");
      const dynamicChannel = client.subscribe({
        template: "user-{userId}",
        params: { userId: "123" },
      });

      staticChannel.bind("alert", staticHandler);
      dynamicChannel.bind("notification", dynamicHandler);

      // Simulate receiving messages
      await mockPusher._simulateMessage("global-notifications", "alert", {
        message: "Global alert",
        level: "warning",
      });

      await mockPusher._simulateMessage("user-123", "notification", {
        message: "User notification",
        timestamp: Date.now(),
      });

      await waitForAsync();

      expect(staticHandler).toHaveBeenCalledWith({
        message: "Global alert",
        level: "warning",
      });
      expect(dynamicHandler).toHaveBeenCalledWith({
        message: "User notification",
        timestamp: expect.any(Number),
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle channel templates with no parameters", () => {
      // This should work the same as static channels
      const registryWithNoParams = {
        "static-channel": {
          name: "static-channel" as const,
          events: {
            event: type({ data: "string" }),
          },
        },
      } as const satisfies Record<string, ChannelDef>;

      const client = createClient(registryWithNoParams, mockPusher as any);
      const channel = client.subscribe("static-channel");

      expect(mockPusher.subscribe).toHaveBeenCalledWith("static-channel");
    });

    it("should handle complex parameter names", () => {
      const registryWithComplexParams = {
        "complex-{param1}-{param2}-{param3}": {
          name: "complex-{param1}-{param2}-{param3}" as const,
          events: {
            event: type({ data: "string" }),
          },
        },
      } as const satisfies Record<string, ChannelDef>;

      const client = createClient(registryWithComplexParams, mockPusher as any);
      const channel = client.subscribe({
        template: "complex-{param1}-{param2}-{param3}",
        params: { param1: "a", param2: "b", param3: "c" },
      });

      expect(mockPusher.subscribe).toHaveBeenCalledWith("complex-a-b-c");
    });
  });
});
