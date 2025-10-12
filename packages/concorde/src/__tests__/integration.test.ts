import { describe, expect, it, vi } from "vitest";
import { createClient } from "../client.js";
import { createServer } from "../server.js";
import type { ChannelDef } from "../types.js";
import {
  createInvalidTestData,
  createMockPusherClient,
  createMockPusherServer,
  createTestData,
  testRegistry,
} from "./test-utils.js";

describe("Integration Tests", () => {
  describe("End-to-end message flow", () => {
    it("should handle valid message from server to client", async () => {
      const mockPusherClient = createMockPusherClient();
      const mockPusherServer = createMockPusherServer();

      const client = createClient(testRegistry, mockPusherClient as any);
      const server = createServer(testRegistry, mockPusherServer as any);

      // Client subscribes to channel and binds to event
      const channel = client.subscribe("user-events");
      const handler = vi.fn();
      channel.bind("user-joined", handler);

      // Server triggers event
      const userData = createTestData.userJoined();

      await server.trigger("user-events", "user-joined", userData);

      // Verify server called pusher.trigger with validated data
      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        "user-events",
        "user-joined",
        userData,
      );

      // Simulate client receiving the message
      await new Promise((resolve) => setTimeout(resolve, 0));
      mockPusherClient._simulateMessage("user-events", "user-joined", userData);

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify client handler was called with validated data
      expect(handler).toHaveBeenCalledWith(userData);
    });

    it("should handle multiple channels trigger", async () => {
      const mockPusherServer = createMockPusherServer();
      const server = createServer(testRegistry, mockPusherServer as any);

      const alertData = createTestData.systemAlert({ level: "medium" });

      await server.trigger("notifications", "system-alert", alertData);

      expect(mockPusherServer.trigger).toHaveBeenCalledWith(
        "notifications",
        "system-alert",
        alertData,
      );
    });

    it("should validate data on client trigger", async () => {
      const mockPusherClient = createMockPusherClient();
      const client = createClient(testRegistry, mockPusherClient as any);

      const channel = client.subscribe("user-events");

      const validData = createTestData.userLeft();

      await channel.trigger("user-left", validData);

      const mockChannel = mockPusherClient.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).toHaveBeenCalledWith("user-left", validData);
    });
  });

  describe("Registry consistency", () => {
    it("should use the same registry for client and server", async () => {
      const mockPusherClient = createMockPusherClient();
      const mockPusherServer = createMockPusherServer();

      const client = createClient(testRegistry, mockPusherClient as any);
      const server = createServer(testRegistry, mockPusherServer as any);

      // Both should be able to work with the same channels
      client.subscribe("user-events");
      expect(mockPusherClient.subscribe).toHaveBeenCalledWith("user-events");

      // Server should be able to trigger to the same channel
      await expect(
        server.trigger(
          "user-events",
          "user-joined",
          createTestData.userJoined(),
        ),
      ).resolves.not.toThrow();
    });

    it("should fail for unknown channels in both client and server", async () => {
      const mockPusherClient = createMockPusherClient();
      const mockPusherServer = createMockPusherServer();

      const client = createClient(testRegistry, mockPusherClient as any);
      const server = createServer(testRegistry, mockPusherServer as any);

      // Client should throw for unknown channel
      expect(() => {
        const channel = client.subscribe("unknown-channel" as any);
        channel.bind("some-event" as any, () => {});
      }).toThrow("Could not find channel unknown-channel");

      // Server should throw for unknown channel
      await expect(
        server.trigger("unknown-channel" as any, "some-event" as any, {}),
      ).rejects.toThrow("Could not find channel unknown-channel");
    });

    it("should fail for unknown events in both client and server", async () => {
      const mockPusherClient = createMockPusherClient();
      const mockPusherServer = createMockPusherServer();

      const client = createClient(testRegistry, mockPusherClient as any);
      const server = createServer(testRegistry, mockPusherServer as any);

      // Client should throw for unknown event
      expect(() => {
        const channel = client.subscribe("user-events");
        channel.bind("unknown-event" as any, () => {});
      }).toThrow("Could not find schema for event unknown-event");

      // Server should throw for unknown event
      await expect(
        server.trigger("user-events", "unknown-event" as any, {}),
      ).rejects.toThrow("Unknown event unknown-event");
    });
  });

  describe("Error propagation", () => {
    it("should handle invalid data on server trigger", async () => {
      const mockPusherServer = createMockPusherServer();
      const server = createServer(testRegistry, mockPusherServer as any);

      const invalidData = createInvalidTestData.userJoined() as any;

      await expect(
        server.trigger("user-events", "user-joined", invalidData),
      ).rejects.toThrow(/Trying to send invalid data/);

      expect(mockPusherServer.trigger).not.toHaveBeenCalled();
    });

    it("should handle invalid data on client trigger", async () => {
      const mockPusherClient = createMockPusherClient();
      const client = createClient(testRegistry, mockPusherClient as any);

      const channel = client.subscribe("user-events");

      const invalidData = {
        userId: 123, // should be string
        timestamp: "invalid", // should be number
      } as any;

      await expect(channel.trigger("user-left", invalidData)).rejects.toThrow(
        /Trying to send invalid data/,
      );

      const mockChannel = mockPusherClient.subscribe.mock.results[0]?.value;
      expect(mockChannel?.trigger).not.toHaveBeenCalled();
    });

    it("should warn and skip invalid received data on client", async () => {
      const mockPusherClient = createMockPusherClient();
      const client = createClient(testRegistry, mockPusherClient as any);

      const channel = client.subscribe("user-events");
      const handler = vi.fn();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      channel.bind("user-joined", handler);

      // Simulate receiving invalid data
      const invalidData = {
        userId: 123, // should be string
        username: "test",
        // missing timestamp
      };

      mockPusherClient._simulateMessage(
        "user-events",
        "user-joined",
        invalidData,
      );

      // Wait for async validation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();

      // Warning should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Received invalid payload",
        expect.any(Array),
      );

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();

      // Warning should be logged
      expect(consoleSpy).toHaveBeenCalledWith(
        "Received invalid payload",
        expect.any(Array),
      );

      consoleSpy.mockRestore();
    });

    it("should handle empty channels array on server", async () => {
      const mockPusherServer = createMockPusherServer();
      const server = createServer(testRegistry, mockPusherServer as any);

      const emptyChannels: any = [];
      const alertData: any = { level: "info", message: "test" };
      await expect(
        server.trigger(emptyChannels, "system-alert" as any, alertData),
      ).rejects.toThrow("No channels provided");
    });

    it("should handle missing event schema validation", async () => {
      const incompleteRegistry = {
        "test-channel": {
          name: "test-channel" as const,
          events: {}, // No events defined
        },
      } as const satisfies Record<string, ChannelDef>;

      const mockPusherServer = createMockPusherServer();
      const server = createServer(incompleteRegistry, mockPusherServer as any);

      await expect(
        (server as any).trigger("test-channel", "non-existent", {}),
      ).rejects.toThrow("Unknown event non-existent");
    });
  });

  describe("Client lifecycle", () => {
    it("should handle disconnect properly", () => {
      const mockPusherClient = createMockPusherClient();
      const client = createClient(testRegistry, mockPusherClient as any);

      client.disconnect();

      expect(mockPusherClient.disconnect).toHaveBeenCalled();
    });

    it("should handle unbind properly", () => {
      const mockPusherClient = createMockPusherClient();
      const client = createClient(testRegistry, mockPusherClient as any);

      const channel = client.subscribe("user-events");
      channel.bind("user-joined", () => {});
      channel.unbind("user-joined");

      const mockChannel = mockPusherClient.subscribe.mock.results[0]?.value;
      expect(mockChannel?.unbind).toHaveBeenCalledWith("user-joined");
    });
  });
});
