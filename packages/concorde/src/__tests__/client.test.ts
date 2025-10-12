import { describe, expect, it, vi } from "vitest";
import { createClient } from "../client.js";
import {
  createInvalidTestData,
  createMockPusherClient,
  createTestData,
  testRegistry,
  waitForAsync,
} from "./test-utils.js";

describe("Client Tests", () => {
  describe("Channel subscription errors", () => {
    it("should throw error for unknown channel names", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      expect(() => {
        const channel = client.subscribe("unknown-channel" as any);
        channel.bind("some-event" as any, () => {});
      }).toThrow("Could not find channel unknown-channel");
    });

    it("should successfully subscribe to valid channels", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      expect(mockPusher.subscribe).toHaveBeenCalledWith("user-events");
      expect(channel).toBeDefined();
    });

    it("should handle multiple channel subscriptions", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const userChannel = client.subscribe("user-events");
      const chatChannel = client.subscribe("chat-room");
      const notifChannel = client.subscribe("notifications");

      expect(mockPusher.subscribe).toHaveBeenCalledTimes(3);
      expect(mockPusher.subscribe).toHaveBeenCalledWith("user-events");
      expect(mockPusher.subscribe).toHaveBeenCalledWith("chat-room");
      expect(mockPusher.subscribe).toHaveBeenCalledWith("notifications");
    });
  });

  describe("Event binding errors", () => {
    it("should throw error for unknown event names", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");

      expect(() => {
        channel.bind("unknown-event" as any, () => {});
      }).toThrow("Could not find schema for event unknown-event");
    });

    it("should successfully bind to valid events", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();

      expect(() => {
        channel.bind("user-joined", handler);
      }).not.toThrow();

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.bind).toHaveBeenCalledWith(
        "user-joined",
        expect.any(Function),
      );
    });

    it("should throw error for valid event in wrong channel", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const userChannel = client.subscribe("user-events");

      // 'message' event exists in 'chat-room' but not in 'user-events'
      expect(() => {
        userChannel.bind("message" as any, () => {});
      }).toThrow("Could not find schema for event message");
    });

    it("should bind to different events in same channel", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const joinHandler = vi.fn();
      const leftHandler = vi.fn();
      const statusHandler = vi.fn();

      channel.bind("user-joined", joinHandler);
      channel.bind("user-left", leftHandler);
      channel.bind("status-changed", statusHandler);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.bind).toHaveBeenCalledTimes(3);
    });
  });

  describe("Invalid payload handling", () => {
    it("should warn and skip invalid received data", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      channel.bind("user-joined", handler);

      // Simulate receiving invalid data
      const invalidData = createInvalidTestData.userJoined();

      await mockPusher._simulateMessage(
        "user-events",
        "user-joined",
        invalidData,
      );

      // Wait for async validation
      await waitForAsync();

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();

      // Warning should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Received invalid payload",
        expect.any(Array),
      );

      consoleSpy.mockRestore();
    });

    it("should process valid received data", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();

      channel.bind("user-joined", handler);

      const validData = createTestData.userJoined();

      await mockPusher._simulateMessage(
        "user-events",
        "user-joined",
        validData,
      );

      // Wait for async validation
      await waitForAsync();

      expect(handler).toHaveBeenCalledWith(validData);
    });

    it("should handle missing required fields in received data", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      channel.bind("user-joined", handler);

      const incompleteData = {
        userId: "user123",
        // missing username and timestamp
      };

      await mockPusher._simulateMessage(
        "user-events",
        "user-joined",
        incompleteData,
      );

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle invalid union types in received data", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      channel.bind("status-changed", handler);

      const invalidUnionData = {
        userId: "user123",
        status: "invisible", // not in 'online' | 'offline' | 'away'
        timestamp: Date.now(),
      };

      await mockPusher._simulateMessage(
        "user-events",
        "status-changed",
        invalidUnionData,
      );

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("Trigger validation", () => {
    it("should validate data before triggering", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("chat-room");

      const validData = {
        messageId: "msg123",
        userId: "user456",
        content: "Hello world!",
        timestamp: Date.now(),
      };

      await channel.trigger("message", validData);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledWith("message", validData);
    });

    it("should reject invalid data when triggering", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("chat-room");

      const invalidData = {
        messageId: 123, // should be string
        userId: null, // should be string
        content: "", // empty string
        timestamp: "not-a-number", // should be number
      };

      await expect(
        channel.trigger("message", invalidData as any),
      ).rejects.toThrow(/Trying to send invalid data/);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).not.toHaveBeenCalled();
    });

    it("should validate different event types correctly", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("chat-room");

      // Valid typing event
      const typingData = {
        userId: "user123",
        isTyping: true,
      };

      await channel.trigger("typing", typingData);

      // Valid reaction event
      const reactionData = {
        messageId: "msg123",
        userId: "user123",
        emoji: "👍",
      };

      await channel.trigger("reaction", reactionData);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledTimes(2);
      expect(mockChannel?.trigger).toHaveBeenCalledWith("typing", typingData);
      expect(mockChannel?.trigger).toHaveBeenCalledWith(
        "reaction",
        reactionData,
      );
    });

    it("should throw error for unknown event when triggering", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("chat-room");

      await expect(
        (channel as any).trigger("unknown-event", {}),
      ).rejects.toThrow("Could not find schema for event unknown-event");

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).not.toHaveBeenCalled();
    });
  });

  describe("Unbind functionality", () => {
    it("should unbind events correctly", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();

      channel.bind("user-joined", handler);
      channel.unbind("user-joined");

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.unbind).toHaveBeenCalledWith("user-joined");
    });

    it("should unbind specific events without affecting others", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const joinHandler = vi.fn();
      const leftHandler = vi.fn();

      channel.bind("user-joined", joinHandler);
      channel.bind("user-left", leftHandler);

      // Unbind only one event
      channel.unbind("user-joined");

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.unbind).toHaveBeenCalledWith("user-joined");
      expect(mockChannel?.unbind).not.toHaveBeenCalledWith("user-left");
    });

    it("should handle unbinding non-existent events gracefully", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");

      // Should not throw when unbinding event that was never bound
      expect(() => {
        channel.unbind("user-joined");
      }).not.toThrow();

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.unbind).toHaveBeenCalledWith("user-joined");
    });
  });

  describe("Multiple event bindings", () => {
    it("should handle multiple handlers for same event", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      // Note: This test shows the current behavior where the second bind overwrites the first
      // In a real implementation, you might want to support multiple handlers
      channel.bind("user-joined", handler1);
      channel.bind("user-joined", handler2);

      const validData = {
        userId: "user123",
        username: "john_doe",
        timestamp: Date.now(),
      };

      await mockPusher._simulateMessage(
        "user-events",
        "user-joined",
        validData,
      );

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Only the last bound handler should be called (current implementation)
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(validData);
    });

    it("should handle binding to multiple events with different handlers", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");
      const joinHandler = vi.fn();
      const leftHandler = vi.fn();
      const statusHandler = vi.fn();

      channel.bind("user-joined", joinHandler);
      channel.bind("user-left", leftHandler);
      channel.bind("status-changed", statusHandler);

      // Simulate different events
      await mockPusher._simulateMessage("user-events", "user-joined", {
        userId: "user123",
        username: "john",
        timestamp: Date.now(),
      });

      await mockPusher._simulateMessage("user-events", "user-left", {
        userId: "user123",
        timestamp: Date.now(),
      });

      await mockPusher._simulateMessage("user-events", "status-changed", {
        userId: "user123",
        status: "offline",
        timestamp: Date.now(),
      });

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(joinHandler).toHaveBeenCalledTimes(1);
      expect(leftHandler).toHaveBeenCalledTimes(1);
      expect(statusHandler).toHaveBeenCalledTimes(1);
    });

    it("should handle cross-channel event bindings", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const userChannel = client.subscribe("user-events");
      const chatChannel = client.subscribe("chat-room");
      const notifChannel = client.subscribe("notifications");

      const userHandler = vi.fn();
      const chatHandler = vi.fn();
      const notifHandler = vi.fn();

      userChannel.bind("user-joined", userHandler);
      chatChannel.bind("message", chatHandler);
      notifChannel.bind("alert", notifHandler);

      // Simulate events on different channels
      await mockPusher._simulateMessage("user-events", "user-joined", {
        userId: "user123",
        username: "john",
        timestamp: Date.now(),
      });

      await mockPusher._simulateMessage("chat-room", "message", {
        messageId: "msg123",
        userId: "user123",
        content: "Hello!",
        timestamp: Date.now(),
      });

      await mockPusher._simulateMessage("notifications", "alert", {
        id: "alert123",
        type: "info",
        message: "Welcome!",
        timestamp: Date.now(),
      });

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(userHandler).toHaveBeenCalledTimes(1);
      expect(chatHandler).toHaveBeenCalledTimes(1);
      expect(notifHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Client disconnect", () => {
    it("should disconnect properly", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      client.disconnect();

      expect(mockPusher.disconnect).toHaveBeenCalled();
    });

    it("should handle disconnect after channel subscriptions", () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      // Subscribe to channels first
      client.subscribe("user-events");
      client.subscribe("chat-room");

      // Then disconnect
      client.disconnect();

      expect(mockPusher.disconnect).toHaveBeenCalled();
    });
  });

  describe("Type safety", () => {
    it("should maintain type safety for event handlers", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("user-events");

      // This should compile without type errors
      channel.bind("user-joined", (payload) => {
        // TypeScript should infer the correct payload type
        expect(typeof payload.userId).toBe("string");
        expect(typeof payload.username).toBe("string");
        expect(typeof payload.timestamp).toBe("number");
      });

      const validData = {
        userId: "user123",
        username: "john_doe",
        timestamp: Date.now(),
      };

      await mockPusher._simulateMessage(
        "user-events",
        "user-joined",
        validData,
      );

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("should maintain type safety for trigger data", async () => {
      const mockPusher = createMockPusherClient();
      const client = createClient(testRegistry, mockPusher as any);

      const channel = client.subscribe("notifications");

      // This should compile without type errors
      const alertData = {
        id: "alert123",
        type: "warning" as const,
        message: "Test alert",
        timestamp: Date.now(),
      };

      await channel.trigger("alert", alertData);

      const mockChannel = mockPusher.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledWith("alert", alertData);
    });
  });
});
