# Basic Usage

This guide covers the fundamental patterns for using Concorde in your application.

## Registry Definition

The registry is the heart of Concorde. It defines all your channels and events with their schemas using the RegistryBuilder:

```typescript
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const registry = new RegistryBuilder()
  .channel('notifications', {
    alert: type({
      id: 'string',
      type: "'info' | 'warning' | 'error'",
      message: 'string',
      timestamp: 'number'
    }),
    'badge-update': type({
      count: 'number'
    })
  })
  .build()
```

## Server-Side Usage

### Creating a Server Instance

```typescript
import Pusher from 'pusher'
import { createServer } from '@matfire/concorde/server'
import { registry } from './registry'

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!
})

export const server = createServer(registry, pusher)
```

### Triggering Events

```typescript
// Single channel
await server.trigger('notifications', 'alert', {
  id: 'alert-123',
  type: 'warning',
  message: 'System maintenance in 10 minutes',
  timestamp: Date.now()
})

// Multiple channels
await server.trigger(
  ['notifications', 'admin-notifications'], 
  'alert',
  {
    id: 'alert-456',
    type: 'error',
    message: 'Service disruption detected',
    timestamp: Date.now()
  }
)
```

### Error Handling

Concorde validates data before sending it to Pusher:

```typescript
try {
  await server.trigger('notifications', 'alert', {
    id: 123, // ❌ Should be string
    type: 'critical', // ❌ Not in union type
    message: 'Invalid alert',
    timestamp: Date.now()
  })
} catch (error) {
  console.error('Validation failed:', error.message)
  // "Trying to send invalid data: [validation errors]"
}
```

## Client-Side Usage

### Creating a Client Instance

```typescript
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { registry } from './registry'

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!
})

export const client = createClient(registry, pusher)
```

### Subscribing to Channels

```typescript
const channel = client.subscribe('notifications')
```

### Binding to Events

```typescript
// Type-safe event handler
channel.bind('alert', (alert) => {
  // alert is typed as: { id: string, type: 'info' | 'warning' | 'error', message: string, timestamp: number }
  
  switch (alert.type) {
    case 'error':
      showErrorNotification(alert.message)
      break
    case 'warning':
      showWarningNotification(alert.message)
      break
    case 'info':
      showInfoNotification(alert.message)
      break
  }
})

channel.bind('badge-update', (update) => {
  // update is typed as: { count: number }
  updateBadgeCount(update.count)
})
```

### Multiple Event Handlers

```typescript
const userChannel = client.subscribe('user-events')

userChannel.bind('user-joined', (data) => {
  console.log(`${data.username} joined`)
})

userChannel.bind('user-left', (data) => {
  console.log(`User ${data.userId} left`)
})

userChannel.bind('status-changed', (data) => {
  console.log(`User ${data.userId} is now ${data.status}`)
})
```

### Unbinding Events

```typescript
// Unbind specific event
channel.unbind('alert')

// Disconnect from all channels
client.disconnect()
```

### Client-Side Triggering

Some Pusher setups allow client-side triggering:

```typescript
// This will validate the data before sending
await channel.trigger('badge-update', {
  count: 5
})
```

## Error Handling on Client

Invalid incoming data is automatically handled:

```typescript
channel.bind('alert', (alert) => {
  // This handler will only be called with valid data
  // Invalid data is logged as a warning and ignored
})

// If the server sends invalid data, you'll see:
// "Received invalid payload [validation errors]"
```

## Best Practices

1. **Keep schemas simple**: Use clear, descriptive field names
2. **Use union types**: For enums and limited string values
3. **Validate early**: Let Concorde catch errors before they reach your handlers
4. **Share registries**: Use the same registry definition across client and server
5. **Handle errors gracefully**: Always wrap server triggers in try-catch blocks

## Next Steps

- Learn about [Schema Validation](/guide/schema-validation) in detail
- Explore [Dynamic Channels](/guide/dynamic-channels)
- Check out [Error Handling](/guide/error-handling) patterns