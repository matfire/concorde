import { type } from "arktype";
import { vi } from "vitest";
import type { ChannelDef } from "../types.js";

// Mock Pusher Client
export const createMockPusherClient = () => {
  const channels = new Map();
  const eventHandlers = new Map();

  return {
    subscribe: vi.fn((channelName: string) => {
      const mockChannel = {
        bind: vi.fn((event: string, handler: Function) => {
          const key = `${channelName}:${event}`;
          eventHandlers.set(key, handler);
        }),
        unbind: vi.fn((event: string) => {
          const key = `${channelName}:${event}`;
          eventHandlers.delete(key);
        }),
        trigger: vi.fn(),
        _name: channelName,
      };
      channels.set(channelName, mockChannel);
      return mockChannel;
    }),
    disconnect: vi.fn(),
    // Helper for tests to simulate receiving messages
    _simulateMessage: async (channelName: string, event: string, data: any) => {
      const key = `${channelName}:${event}`;
      const handler = eventHandlers.get(key);
      if (handler) {
        await handler(data);
      }
    },
    _getEventHandlers: () => eventHandlers,
    _getChannels: () => channels,
  };
};

// Mock Pusher Server
export const createMockPusherServer = () => ({
  trigger: vi.fn().mockResolvedValue({ status: 200 }),
});

// Dynamic Channels Test Registry
export const dynamicTestRegistry = {
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
} as const satisfies Record<string, ChannelDef>;

// Shared Test Registry
export const testRegistry = {
  "user-events": {
    name: "user-events" as const,
    events: {
      "user-joined": type({
        userId: "string",
        username: "string",
        timestamp: "number",
      }),
      "user-left": type({
        userId: "string",
        timestamp: "number",
      }),
      "status-changed": type({
        userId: "string",
        status: "'online' | 'offline' | 'away'",
        timestamp: "number",
      }),
    },
  },
  "chat-room": {
    name: "chat-room" as const,
    events: {
      message: type({
        messageId: "string",
        userId: "string",
        content: "string",
        timestamp: "number",
      }),
      typing: type({
        userId: "string",
        isTyping: "boolean",
      }),
      reaction: type({
        messageId: "string",
        userId: "string",
        emoji: "string",
      }),
    },
  },
  notifications: {
    name: "notifications" as const,
    events: {
      alert: type({
        id: "string",
        type: "'info' | 'warning' | 'error'",
        message: "string",
        timestamp: "number",
      }),
      "badge-update": type({
        count: "number",
      }),
      "system-alert": type({
        level: "'low' | 'medium' | 'high'",
        message: "string",
        source: "string",
      }),
      "user-notification": type({
        userId: "string",
        message: "string",
        type: "'info' | 'warning' | 'error'",
        timestamp: "number",
      }),
    },
  },
  analytics: {
    name: "analytics" as const,
    events: {
      "page-view": type({
        userId: "string",
        page: "string",
        timestamp: "number",
        metadata: "object",
      }),
      "button-click": type({
        userId: "string",
        buttonId: "string",
        page: "string",
      }),
    },
  },
} as const satisfies Record<string, ChannelDef>;

// Alternative minimal test registry for specific scenarios
export const minimalTestRegistry = {
  "test-channel": {
    name: "test-channel" as const,
    events: {
      "test-event": type({
        value: "string",
      }),
    },
  },
} as const satisfies Record<string, ChannelDef>;

// Helper function to wait for async operations in tests
export const waitForAsync = (ms: number = 10) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper to create test data
export const createTestData = {
  userJoined: (
    overrides: Partial<{
      userId: string;
      username: string;
      timestamp: number;
    }> = {},
  ) => ({
    userId: "user123",
    username: "john_doe",
    timestamp: Date.now(),
    ...overrides,
  }),

  userLeft: (
    overrides: Partial<{ userId: string; timestamp: number }> = {},
  ) => ({
    userId: "user123",
    timestamp: Date.now(),
    ...overrides,
  }),

  statusChanged: (
    overrides: Partial<{
      userId: string;
      status: "online" | "offline" | "away";
      timestamp: number;
    }> = {},
  ) => ({
    userId: "user123",
    status: "online" as const,
    timestamp: Date.now(),
    ...overrides,
  }),

  chatMessage: (
    overrides: Partial<{
      messageId: string;
      userId: string;
      content: string;
      timestamp: number;
    }> = {},
  ) => ({
    messageId: "msg123",
    userId: "user123",
    content: "Hello world!",
    timestamp: Date.now(),
    ...overrides,
  }),

  typing: (overrides: Partial<{ userId: string; isTyping: boolean }> = {}) => ({
    userId: "user123",
    isTyping: true,
    ...overrides,
  }),

  reaction: (
    overrides: Partial<{
      messageId: string;
      userId: string;
      emoji: string;
    }> = {},
  ) => ({
    messageId: "msg123",
    userId: "user123",
    emoji: "👍",
    ...overrides,
  }),

  alert: (
    overrides: Partial<{
      id: string;
      type: "info" | "warning" | "error";
      message: string;
      timestamp: number;
    }> = {},
  ) => ({
    id: "alert123",
    type: "info" as const,
    message: "Test alert",
    timestamp: Date.now(),
    ...overrides,
  }),

  badgeUpdate: (overrides: Partial<{ count: number }> = {}) => ({
    count: 5,
    ...overrides,
  }),

  systemAlert: (
    overrides: Partial<{
      level: "low" | "medium" | "high";
      message: string;
      source: string;
    }> = {},
  ) => ({
    level: "medium" as const,
    message: "System message",
    source: "monitoring",
    ...overrides,
  }),

  userNotification: (
    overrides: Partial<{
      userId: string;
      message: string;
      type: "info" | "warning" | "error";
      timestamp: number;
    }> = {},
  ) => ({
    userId: "user123",
    message: "Welcome!",
    type: "info" as const,
    timestamp: Date.now(),
    ...overrides,
  }),

  pageView: (
    overrides: Partial<{
      userId: string;
      page: string;
      timestamp: number;
      metadata: object;
    }> = {},
  ) => ({
    userId: "user123",
    page: "/dashboard",
    timestamp: Date.now(),
    metadata: { browser: "chrome" },
    ...overrides,
  }),

  buttonClick: (
    overrides: Partial<{ userId: string; buttonId: string; page: string }> = {},
  ) => ({
    userId: "user123",
    buttonId: "btn-submit",
    page: "/form",
    ...overrides,
  }),
};

// Helper to create invalid test data (for error testing)
export const createInvalidTestData = {
  userJoined: () => ({
    userId: 123, // should be string
    username: null, // should be string
    timestamp: "not-a-number", // should be number
  }),

  chatMessage: () => ({
    messageId: 123, // should be string
    userId: null, // should be string
    content: "", // empty string
    timestamp: "not-a-number", // should be number
  }),

  statusChanged: () => ({
    userId: "user123",
    status: "invisible", // not in union type
    timestamp: Date.now(),
  }),

  alert: () => ({
    id: "alert123",
    type: "critical", // not in union type
    message: "Test alert",
    timestamp: Date.now(),
  }),
};
