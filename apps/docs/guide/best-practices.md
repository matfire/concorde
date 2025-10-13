# Best Practices

This guide covers recommended patterns and practices for building robust real-time applications with Concorde.

## Schema Design

### Keep Schemas Simple and Clear

```typescript
// ✅ Good: Clear, specific field names
const messageSchema = type({
  messageId: 'string',
  content: 'string',
  senderId: 'string',
  timestamp: 'number',
  type: "'text' | 'image' | 'file'"
})

// ❌ Avoid: Ambiguous or overly generic names
const badSchema = type({
  id: 'string',
  data: 'object',
  info: 'string'
})
```

### Use Union Types for Enums

```typescript
// ✅ Good: Explicit union types
const notificationSchema = type({
  type: "'info' | 'warning' | 'error' | 'success'",
  priority: "'low' | 'medium' | 'high'",
  category: "'system' | 'user' | 'security'"
})

// ❌ Avoid: Generic strings without constraints
const badNotificationSchema = type({
  type: 'string',
  priority: 'string',
  category: 'string'
})
```

### Validate Data Constraints

```typescript
// ✅ Good: Specific validation rules
const userSchema = type({
  userId: 'string>0', // Non-empty string
  email: 'email',      // Built-in email validation
  age: 'number>=13',   // Minimum age requirement
  username: 'string>=3<=20' // Length constraints
})
```

## Registry Organization

### Shared Registry Module

Create a shared registry that both client and server can import:

```typescript
// registry.ts
import { RegistryBuilder } from '@matfire/concorde'
import { addAuthChannels } from './features/auth/channels'
import { addChatChannels } from './features/chat/channels'

export const registry = new RegistryBuilder()
  .let(addAuthChannels)
  .let(addChatChannels)
  .build()

// Or if you prefer object spreading:
import { authChannels } from './features/auth/channels'
import { chatChannels } from './features/chat/channels'

export const registry = {
  ...authChannels,
  ...chatChannels
} as const
```

### Feature-Based Organization

For large applications, organize channels by feature:

```typescript
// features/auth/channels.ts
export const authChannels = {
  'auth-{userId}': {
    name: 'auth-{userId}' as const,
    events: {
      'session-expired': type(/* ... */),
      'login-attempt': type(/* ... */)
    }
  }
} as const

// features/chat/channels.ts
export const chatChannels = {
  'chat-{roomId}': {
    name: 'chat-{roomId}' as const,
    events: {
      message: type(/* ... */),
      'user-joined': type(/* ... */)
    }
  }
} as const

// registry.ts
import { authChannels } from './features/auth/channels'
import { chatChannels } from './features/chat/channels'

export const registry = {
  ...authChannels,
  ...chatChannels
} as const satisfies Record<string, ChannelDef>
```

## Error Handling Patterns

### Comprehensive Error Handling

```typescript
// server/pusher-service.ts
import { createServer } from '@matfire/concorde/server'
import { registry } from '../registry'

class PusherService {
  private server = createServer(registry, pusher)

  async sendNotification(
    channel: string, 
    event: string, 
    data: unknown
  ): Promise<boolean> {
    try {
      await this.server.trigger(channel, event, data)
      return true
    } catch (error) {
      this.handleError(error, { channel, event, data })
      return false
    }
  }

  private handleError(error: Error, context: any) {
    if (error.message.includes('Trying to send invalid data')) {
      // Validation error - log and potentially alert developers
      console.error('Validation error:', error.message, context)
      this.logToMonitoring('validation_error', { error, context })
    } else if (error.message.includes('Unknown event')) {
      // Configuration error - critical alert
      console.error('Schema error:', error.message, context)
      this.logToMonitoring('schema_error', { error, context })
    } else {
      // Network/Pusher error - retry might help
      console.error('Pusher error:', error.message, context)
      this.logToMonitoring('pusher_error', { error, context })
    }
  }

  private logToMonitoring(type: string, data: any) {
    // Send to your monitoring service
  }
}
```

### Client-Side Error Boundaries

```typescript
// client/pusher-client.ts
import { createClient } from '@matfire/concorde/client'
import { registry } from '../registry'

class PusherClient {
  private client = createClient(registry, pusher)
  private subscriptions = new Map()

  safeSubscribe(channelName: string) {
    try {
      if (this.subscriptions.has(channelName)) {
        return this.subscriptions.get(channelName)
      }

      const channel = this.client.subscribe(channelName)
      this.subscriptions.set(channelName, channel)
      return channel
    } catch (error) {
      console.error(`Failed to subscribe to ${channelName}:`, error)
      return null
    }
  }

  safeBind(channelName: string, event: string, handler: Function) {
    const channel = this.safeSubscribe(channelName)
    if (!channel) return

    try {
      channel.bind(event, handler)
    } catch (error) {
      console.error(`Failed to bind ${event} on ${channelName}:`, error)
    }
  }

  cleanup() {
    this.client.disconnect()
    this.subscriptions.clear()
  }
}
```

## Performance Optimization

### Connection Management

```typescript
// Use a singleton pattern for Pusher instances
class PusherManager {
  private static instance: PusherManager
  private pusherClient?: any
  private concorideClient?: any

  static getInstance(): PusherManager {
    if (!PusherManager.instance) {
      PusherManager.instance = new PusherManager()
    }
    return PusherManager.instance
  }

  getClient() {
    if (!this.pusherClient) {
      this.pusherClient = new Pusher(config.pusherKey, config.pusherOptions)
      this.concorideClient = createClient(registry, this.pusherClient)
    }
    return this.concorideClient
  }

  disconnect() {
    if (this.pusherClient) {
      this.pusherClient.disconnect()
      this.pusherClient = null
      this.concorideClient = null
    }
  }
}
```

### Subscription Management

```typescript
// React hook for managing subscriptions
import { useEffect, useRef } from 'react'

function useRealtimeSubscription(channelName: string, events: Record<string, Function>) {
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const client = PusherManager.getInstance().getClient()
    channelRef.current = client.subscribe(channelName)

    // Bind all events
    Object.entries(events).forEach(([event, handler]) => {
      channelRef.current.bind(event, handler)
    })

    return () => {
      // Cleanup on unmount
      Object.keys(events).forEach(event => {
        channelRef.current?.unbind(event)
      })
    }
  }, [channelName, events])

  return channelRef.current
}

// Usage
function ChatComponent({ roomId }: { roomId: string }) {
  const handlers = useMemo(() => ({
    message: (data: any) => console.log('New message:', data),
    'user-joined': (data: any) => console.log('User joined:', data)
  }), [])

  useRealtimeSubscription(`chat-${roomId}`, handlers)

  return <div>Chat Room</div>
}
```

## Security Considerations

### Data Sanitization

```typescript
// Always validate and sanitize data before triggering events
function sanitizeMessage(content: string): string {
  return content
    .trim()
    .slice(0, 1000) // Limit length
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
}

async function sendChatMessage(roomId: string, content: string, userId: string) {
  const sanitizedContent = sanitizeMessage(content)
  
  if (!sanitizedContent) {
    throw new Error('Message content is required')
  }

  await server.trigger(
    { template: 'chat-{roomId}', params: { roomId } },
    'message',
    {
      content: sanitizedContent,
      userId,
      timestamp: Date.now()
    }
  )
}
```

### Rate Limiting

```typescript
// Implement rate limiting for client actions
class RateLimiter {
  private counts = new Map<string, { count: number; resetTime: number }>()

  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const current = this.counts.get(key)

    if (!current || now > current.resetTime) {
      this.counts.set(key, { count: 1, resetTime: now + windowMs })
      return true
    }

    if (current.count >= limit) {
      return false
    }

    current.count++
    return true
  }
}

const rateLimiter = new RateLimiter()

async function sendMessage(userId: string, content: string) {
  if (!rateLimiter.isAllowed(`message:${userId}`, 10, 60000)) {
    throw new Error('Rate limit exceeded')
  }

  // Send message...
}
```

## Testing Strategies

### Mock Registry for Tests

```typescript
// test-utils/mock-registry.ts
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const mockRegistry = new RegistryBuilder()
  .channel('test-channel', {
    'test-event': type({
      id: 'string',
      data: 'string'
    })
  })
  .build()

export const createMockPusher = () => ({
  subscribe: vi.fn(() => ({
    bind: vi.fn(),
    unbind: vi.fn(),
    trigger: vi.fn()
  })),
  disconnect: vi.fn(),
  trigger: vi.fn()
})
```

### Integration Tests

```typescript
// __tests__/integration.test.ts
describe('Real-time Communication', () => {
  it('should handle end-to-end message flow', async () => {
    const mockPusherServer = createMockPusher()
    const mockPusherClient = createMockPusher()
    
    const server = createServer(registry, mockPusherServer)
    const client = createClient(registry, mockPusherClient)

    // Test the complete flow
    const channel = client.subscribe('chat-room')
    const handler = vi.fn()
    
    channel.bind('message', handler)

    await server.trigger('chat-room', 'message', {
      messageId: 'msg-123',
      content: 'Hello world',
      userId: 'user-456',
      timestamp: Date.now()
    })

    expect(mockPusherServer.trigger).toHaveBeenCalledWith(
      'chat-room',
      'message',
      expect.objectContaining({
        content: 'Hello world'
      })
    )
  })
})
```

## Deployment Considerations

### Environment Configuration

```typescript
// config/pusher.ts
interface PusherConfig {
  key: string
  cluster: string
  appId?: string
  secret?: string
  forceTLS?: boolean
}

const pusherConfig: PusherConfig = {
  key: process.env.PUSHER_KEY!,
  cluster: process.env.PUSHER_CLUSTER!,
  appId: process.env.PUSHER_APP_ID,
  secret: process.env.PUSHER_SECRET,
  forceTLS: process.env.NODE_ENV === 'production'
}

export default pusherConfig
```

### Graceful Shutdown

```typescript
// server/graceful-shutdown.ts
class GracefulShutdown {
  private pusherService: PusherService

  constructor(pusherService: PusherService) {
    this.pusherService = pusherService

    process.on('SIGTERM', this.shutdown.bind(this))
    process.on('SIGINT', this.shutdown.bind(this))
  }

  private async shutdown() {
    console.log('Gracefully shutting down...')
    
    // Stop accepting new requests
    // Wait for pending operations
    await this.pusherService.cleanup()
    
    process.exit(0)
  }
}
```

## Monitoring and Observability

### Metrics Collection

```typescript
// monitoring/metrics.ts
interface PusherMetrics {
  messagesTriggered: number
  validationErrors: number
  connectionErrors: number
  subscriptions: number
}

class MetricsCollector {
  private metrics: PusherMetrics = {
    messagesTriggered: 0,
    validationErrors: 0,
    connectionErrors: 0,
    subscriptions: 0
  }

  incrementMessageTriggered() {
    this.metrics.messagesTriggered++
  }

  incrementValidationError() {
    this.metrics.validationErrors++
  }

  getMetrics(): PusherMetrics {
    return { ...this.metrics }
  }

  reset() {
    Object.keys(this.metrics).forEach(key => {
      (this.metrics as any)[key] = 0
    })
  }
}
```

## Next Steps

- Check out the complete [API Reference](/api/client)
- Learn about [Dynamic Channels](/guide/dynamic-channels) for advanced use cases