# Server API

The server API provides type-safe event triggering for Node.js server environments.

## createServer

Creates a type-safe Pusher server instance.

```typescript
import { createServer } from '@matfire/concorde/server'
import Pusher from 'pusher'

function createServer<Registry>(
  registry: Registry,
  pusher: Pusher
): TypedPusherServer<Registry>
```

### Parameters

- **registry**: The channel registry defining available channels and events
- **pusher**: A configured Pusher server instance

### Returns

Returns a `TypedPusherServer` instance with type-safe methods.

### Example

```typescript
import Pusher from 'pusher'
import { createServer } from '@matfire/concorde/server'
import { registry } from './registry'

const pusher = new Pusher({
  appId: 'your-app-id',
  key: 'your-key',
  secret: 'your-secret',
  cluster: 'your-cluster'
})

const server = createServer(registry, pusher)
```

## TypedPusherServer

The main server interface for triggering events on channels.

### Methods

#### trigger

Triggers an event on one or more channels with type-safe data validation.

```typescript
function trigger<
  Ch extends ChannelSpecifier<Registry>,
  Ev extends EventNames<Registry, Ch>
>(
  channel: Ch | Ch[],
  event: Ev,
  data: InType<Registry, Ch, Ev>
): Promise<Pusher.Response>
```

**Parameters:**
- **channel**: Single channel specifier or array of channel specifiers
- **event**: The event name to trigger
- **data**: The event payload (validated against schema)

**Returns:**
Promise resolving to Pusher's response object

## Single Channel Triggering

### Static Channel

```typescript
await server.trigger('notifications', 'alert', {
  id: 'alert-123',
  type: 'warning',
  message: 'System maintenance in 10 minutes',
  timestamp: Date.now()
})
```

### Dynamic Channel

```typescript
// Single parameter
await server.trigger(
  { template: 'user-{userId}', params: { userId: 'user123' } },
  'notification',
  {
    message: 'You have a new message',
    timestamp: Date.now()
  }
)

// Multiple parameters
await server.trigger(
  { 
    template: 'room-{roomId}-user-{userId}', 
    params: { roomId: 'room456', userId: 'user123' } 
  },
  'message',
  {
    content: 'Hello everyone!',
    timestamp: Date.now(),
    senderId: 'user123'
  }
)
```

## Multi-Channel Triggering

### Multiple Static Channels

```typescript
await server.trigger(
  ['admin-notifications', 'user-notifications', 'system-alerts'],
  'emergency-alert',
  {
    level: 'critical',
    message: 'Service disruption detected',
    timestamp: Date.now()
  }
)
```

### Multiple Dynamic Channels

```typescript
// Notify multiple users
const userIds = ['user123', 'user456', 'user789']

await server.trigger(
  userIds.map(userId => ({
    template: 'user-{userId}',
    params: { userId }
  })),
  'friend-request',
  {
    fromUserId: 'user999',
    fromUsername: 'john_doe',
    timestamp: Date.now()
  }
)
```

### Mixed Channel Types

```typescript
await server.trigger(
  [
    'global-notifications', // Static channel
    { template: 'user-{userId}', params: { userId: 'admin1' } }, // Dynamic channel
    { template: 'user-{userId}', params: { userId: 'admin2' } }  // Dynamic channel
  ],
  'system-announcement',
  {
    title: 'System Update',
    message: 'Scheduled maintenance tonight',
    priority: 'high'
  }
)
```

## Error Handling

### Validation Errors

When data doesn't match the schema:

```typescript
try {
  await server.trigger('user-events', 'user-joined', {
    userId: 123, // ❌ Should be string
    username: '', // ❌ Empty string
    timestamp: 'invalid' // ❌ Should be number
  })
} catch (error) {
  console.error('Validation failed:', error.message)
  // "Trying to send invalid data: [
  //   { path: ['userId'], message: 'Expected string, got number' },
  //   { path: ['username'], message: 'String must not be empty' },
  //   { path: ['timestamp'], message: 'Expected number, got string' }
  // ]"
}
```

### Unknown Channel Errors

```typescript
try {
  await server.trigger('unknown-channel' as any, 'some-event', {})
} catch (error) {
  console.error(error.message) // "Could not find channel unknown-channel"
}
```

### Unknown Event Errors

```typescript
try {
  await server.trigger('user-events', 'unknown-event' as any, {})
} catch (error) {
  console.error(error.message) // "Unknown event unknown-event"
}
```

### Empty Channel Array

```typescript
try {
  await server.trigger([], 'some-event' as any, {})
} catch (error) {
  console.error(error.message) // "No channels provided"
}
```


## Next Steps

- [Registry Builder](/api/registry) - Advanced registry construction
- [Types Reference](/api/types) - Complete type definitions
- [Error Handling Guide](/guide/error-handling) - Comprehensive error handling patterns