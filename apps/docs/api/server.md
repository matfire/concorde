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
trigger<
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

## Advanced Usage

### Conditional Triggering

```typescript
async function notifyUser(userId: string, notification: any) {
  try {
    const response = await server.trigger(
      { template: 'user-{userId}', params: { userId } },
      'notification',
      notification
    )
    
    console.log('Notification sent:', response.status)
    return true
  } catch (error) {
    console.error('Failed to send notification:', error.message)
    return false
  }
}

// Bulk notification with error handling
async function notifyMultipleUsers(userIds: string[], notification: any) {
  const results = await Promise.allSettled(
    userIds.map(userId => notifyUser(userId, notification))
  )
  
  const successful = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  
  console.log(`Notifications: ${successful} sent, ${failed} failed`)
}
```

### Response Handling

```typescript
const response = await server.trigger('notifications', 'alert', alertData)

console.log('Status:', response.status) // HTTP status code
console.log('Response body:', response.body) // Response data

// Pusher response includes:
// - status: HTTP status code
// - body: Response body from Pusher API
```

### Rate Limiting and Batching

```typescript
class NotificationService {
  private queue: Array<{ channel: any, event: string, data: any }> = []
  private batchSize = 10
  private batchInterval = 1000 // 1 second

  constructor(private server: TypedPusherServer<any>) {
    this.processBatch()
  }

  async queueNotification(channel: any, event: string, data: any) {
    this.queue.push({ channel, event, data })
  }

  private async processBatch() {
    setInterval(async () => {
      if (this.queue.length === 0) return

      const batch = this.queue.splice(0, this.batchSize)
      
      await Promise.allSettled(
        batch.map(({ channel, event, data }) =>
          this.server.trigger(channel, event, data)
        )
      )
    }, this.batchInterval)
  }
}
```

## Webhook Integration

### Processing Webhook Events

```typescript
import { Request, Response } from 'express'
import crypto from 'crypto'

function validateWebhook(req: Request): boolean {
  const signature = req.headers['x-pusher-signature']
  const body = JSON.stringify(req.body)
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.PUSHER_SECRET!)
    .update(body)
    .digest('hex')
  
  return signature === `sha256=${expectedSignature}`
}

async function handleWebhook(req: Request, res: Response) {
  if (!validateWebhook(req)) {
    return res.status(401).send('Unauthorized')
  }

  const events = req.body.events

  for (const event of events) {
    switch (event.name) {
      case 'channel_occupied':
        await handleChannelOccupied(event.channel)
        break
      case 'channel_vacated':
        await handleChannelVacated(event.channel)
        break
      case 'member_added':
        await handleMemberAdded(event.channel, event.user_id)
        break
      case 'member_removed':
        await handleMemberRemoved(event.channel, event.user_id)
        break
    }
  }

  res.status(200).send('OK')
}

async function handleChannelOccupied(channel: string) {
  // Trigger event when channel becomes active
  await server.trigger('admin-events', 'channel-occupied', {
    channel,
    timestamp: Date.now()
  })
}
```

## Express.js Integration

### Middleware for Real-time Updates

```typescript
import express from 'express'

const app = express()

// Middleware to trigger events after database updates
app.use('/api/users/:id', async (req, res, next) => {
  const originalSend = res.send
  
  res.send = function(data) {
    // Trigger real-time update after successful response
    if (res.statusCode >= 200 && res.statusCode < 300) {
      server.trigger(
        { template: 'user-{userId}', params: { userId: req.params.id } },
        'profile-updated',
        JSON.parse(data)
      ).catch(console.error)
    }
    
    return originalSend.call(this, data)
  }
  
  next()
})
```

### REST API with Real-time Updates

```typescript
app.post('/api/messages', async (req, res) => {
  try {
    // Save to database
    const message = await db.messages.create(req.body)
    
    // Trigger real-time event
    await server.trigger(
      { template: 'chat-{roomId}', params: { roomId: message.roomId } },
      'message',
      {
        messageId: message.id,
        content: message.content,
        userId: message.userId,
        timestamp: message.createdAt.getTime()
      }
    )
    
    res.json(message)
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})
```

## TypeScript Integration

### Strongly Typed Service Layer

```typescript
import type { TypedPusherServer, EventNames, InType } from '@matfire/concorde'
import type { registry } from './registry'

class RealtimeService {
  constructor(private server: TypedPusherServer<typeof registry>) {}

  async notifyUser<E extends EventNames<typeof registry, 'user-{userId}'>>(
    userId: string,
    event: E,
    data: InType<typeof registry, 'user-{userId}', E>
  ) {
    return this.server.trigger(
      { template: 'user-{userId}', params: { userId } },
      event,
      data
    )
  }

  async broadcastToRoom<E extends EventNames<typeof registry, 'room-{roomId}'>>(
    roomId: string,
    event: E,
    data: InType<typeof registry, 'room-{roomId}', E>
  ) {
    return this.server.trigger(
      { template: 'room-{roomId}', params: { roomId } },
      event,
      data
    )
  }
}

const realtimeService = new RealtimeService(server)

// Usage with full type safety
await realtimeService.notifyUser('user123', 'notification', {
  message: 'Hello!',
  timestamp: Date.now()
})
```

## Next Steps

- [Registry Builder](/api/registry) - Advanced registry construction
- [Types Reference](/api/types) - Complete type definitions
- [Error Handling Guide](/guide/error-handling) - Comprehensive error handling patterns