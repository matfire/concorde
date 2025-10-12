import { type } from "arktype";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import type { ChannelDef } from "../types.js";
import {
  createInvalidTestData,
  createMockPusherServer,
  createTestData,
  testRegistry,
} from "./test-utils.js";

describe("Server Tests", () => {
  describe("Single channel trigger", () => {
    it("should trigger event to single channel with valid data", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const notificationData = {
        userId: "user123",
        message: "Welcome to our platform!",
        type: "info" as const,
        timestamp: Date.now(),
      };

      const result = await server.trigger(
        "notifications",
        "user-notification",
        notificationData,
      );

      expect(result).toEqual({ status: 200 });
      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "notifications",
        "user-notification",
        notificationData,
      );
    });

    it("should trigger different event types to same channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // First event type
      const alertData = {
        level: "high" as const,
        message: "System maintenance required",
        source: "monitoring",
      };

      await server.trigger("notifications", "system-alert", alertData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "notifications",
        "system-alert",
        alertData,
      );

      // Second event type
      const notificationData = {
        userId: "admin",
        message: "Maintenance completed",
        type: "info" as const,
        timestamp: Date.now(),
      };

      await server.trigger(
        "notifications",
        "user-notification",
        notificationData,
      );

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "notifications",
        "user-notification",
        notificationData,
      );
    });

    it("should handle different channels with their respective events", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // Chat message
      const chatData = createTestData.chatMessage();

      await server.trigger("chat-room", "message", chatData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "chat-room",
        "message",
        chatData,
      );

      // Analytics event
      const analyticsData = {
        userId: "user1",
        page: "/dashboard",
        timestamp: Date.now(),
        metadata: { browser: "chrome" },
      };

      await server.trigger("analytics", "page-view", analyticsData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "analytics",
        "page-view",
        analyticsData,
      );
    });
  });

  describe("Multiple channel trigger", () => {
    it("should trigger event to multiple channels", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const alertData = {
        level: "high" as const,
        message: "Critical system alert",
        source: "security",
      };

      await server.trigger(["notifications"], "system-alert", alertData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        ["notifications"],
        "system-alert",
        alertData,
      );
    });

    it("should validate against first channel in array", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // Use notification event schema (first channel)
      const notificationData = {
        userId: "user123",
        message: "Broadcast message",
        type: "info" as const,
        timestamp: Date.now(),
      };

      // Trigger to multiple channels, validation uses first channel schema
      await server.trigger(
        ["notifications"],
        "user-notification",
        notificationData,
      );

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        ["notifications"],
        "user-notification",
        notificationData,
      );
    });

    it("should handle array with single channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const typingData = createTestData.typing();

      await server.trigger(["chat-room"], "typing", typingData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        ["chat-room"],
        "typing",
        typingData,
      );
    });
  });

  describe("Schema validation errors", () => {
    it("should reject invalid data with detailed error message", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const invalidData = {
        userId: 123, // should be string
        message: null, // should be string
        type: "invalid-type", // should be 'info' | 'warning' | 'error'
        timestamp: "not-a-number", // should be number
      };

      await expect(
        server.trigger(
          "notifications",
          "user-notification",
          invalidData as any,
        ),
      ).rejects.toThrow(/Trying to send invalid data/);

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should reject data missing required fields", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const incompleteData = {
        userId: "user123",
        // missing message, type, timestamp
      };

      await expect(
        server.trigger(
          "notifications",
          "user-notification",
          incompleteData as any,
        ),
      ).rejects.toThrow(/Trying to send invalid data/);

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should reject data with wrong types for nested objects", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const invalidAnalyticsData = {
        userId: "user1",
        page: "/dashboard",
        timestamp: Date.now(),
        metadata: "not-an-object", // should be object
      };

      await expect(
        server.trigger("analytics", "page-view", invalidAnalyticsData as any),
      ).rejects.toThrow(/Trying to send invalid data/);

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should validate union types correctly", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // Valid union value
      const validAlert = {
        level: "medium" as const,
        message: "Warning message",
        source: "api",
      };

      await server.trigger("notifications", "system-alert", validAlert);
      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "notifications",
        "system-alert",
        validAlert,
      );

      // Invalid union value
      const invalidAlert = {
        level: "critical", // not in 'low' | 'medium' | 'high'
        message: "Critical message",
        source: "api",
      };

      await expect(
        server.trigger("notifications", "system-alert", invalidAlert as any),
      ).rejects.toThrow(/Trying to send invalid data/);
    });
  });

  describe("Unknown channel/event errors", () => {
    it("should throw error for unknown channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      await expect(
        (server as any).trigger("unknown-channel", "some-event", {}),
      ).rejects.toThrow("Could not find channel unknown-channel");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should throw error for unknown event in valid channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      await expect(
        (server as any).trigger("notifications", "unknown-event", {}),
      ).rejects.toThrow("Unknown event unknown-event");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should throw error for valid event in wrong channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // 'message' event exists in 'chat' channel but not in 'notifications'
      await expect(
        (server as any).trigger("notifications", "message", {}),
      ).rejects.toThrow("Unknown event message");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should validate using first channel when multiple channels provided", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // First channel is 'notifications', so validate against notification events
      await expect(
        (server as any).trigger(["notifications"], "message", {}), // 'message' doesn't exist in notifications
      ).rejects.toThrow("Unknown event message");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Empty channels array", () => {
    it("should throw error when channels array is empty", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const validData = {
        userId: "user123",
        message: "Test message",
        type: "info" as const,
        timestamp: Date.now(),
      };

      await expect(
        (server as any).trigger([], "user-notification", validData),
      ).rejects.toThrow("No channels provided");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });

    it("should handle undefined/null channels", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      const validData = {
        userId: "user123",
        message: "Test message",
        type: "info" as const,
        timestamp: Date.now(),
      };

      // Test with undefined
      await expect(
        (server as any).trigger(undefined, "user-notification", validData),
      ).rejects.toThrow("No channels provided");

      // Test with null
      await expect(
        (server as any).trigger(null, "user-notification", validData),
      ).rejects.toThrow("No channels provided");

      expect(mockPusher.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Registry edge cases", () => {
    it("should handle registry with single channel", async () => {
      const singleChannelRegistry = {
        single: {
          name: "single" as const,
          events: {
            test: type({ value: "string" }),
          },
        },
      } as const satisfies Record<string, ChannelDef>;

      const mockPusher = createMockPusherServer();
      const server = createServer(singleChannelRegistry, mockPusher as any);

      await server.trigger("single", "test", { value: "test" });

      expect(mockPusher.trigger).toHaveBeenCalledWith("single", "test", {
        value: "test",
      });
    });

    it("should handle registry with single event per channel", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // Each channel should work independently
      await server.trigger(
        "chat-room",
        "message",
        createTestData.chatMessage(),
      );

      await server.trigger("analytics", "page-view", {
        userId: "user1",
        page: "/home",
        timestamp: Date.now(),
        metadata: {},
      });

      expect(mockPusher.trigger).toHaveBeenCalledTimes(2);
    });
  });

  describe("Type safety", () => {
    it("should maintain type safety for event data", async () => {
      const mockPusher = createMockPusherServer();
      const server = createServer(testRegistry, mockPusher as any);

      // This should compile without type errors
      const typedData = createTestData.userJoined();

      await server.trigger("user-events", "user-joined", typedData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "user-events",
        "user-joined",
        typedData,
      );
    });

    it("should handle complex nested types", async () => {
      const complexRegistry = {
        complex: {
          name: "complex" as const,
          events: {
            "nested-event": type({
              user: {
                id: "string",
                profile: {
                  name: "string",
                  settings: {
                    theme: "'dark' | 'light'",
                    notifications: "boolean",
                  },
                },
              },
              metadata: {
                version: "number",
                features: "string[]",
              },
            }),
          },
        },
      } as const satisfies Record<string, ChannelDef>;

      const mockPusher = createMockPusherServer();
      const server = createServer(complexRegistry, mockPusher as any);

      const complexData = {
        user: {
          id: "user123",
          profile: {
            name: "John Doe",
            settings: {
              theme: "dark" as const,
              notifications: true,
            },
          },
        },
        metadata: {
          version: 1,
          features: ["feature1", "feature2"],
        },
      };

      await server.trigger("complex", "nested-event", complexData);

      expect(mockPusher.trigger).toHaveBeenCalledWith(
        "complex",
        "nested-event",
        complexData,
      );
    });
  });
});
