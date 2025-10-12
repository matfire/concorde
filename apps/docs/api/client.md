# Client API

The client API provides type-safe real-time communication for browser and Node.js environments.

## createClient

Creates a type-safe Pusher client instance.

```typescript
import { createClient } from '@matfire/concorde/client'
import Pusher from 'pusher-js'

function createClient<Registry>(
  registry: Registry,
  pusher: Pusher
): TypedPusherClient<Registry>
```

### Parameters

- **registry**: The channel registry defining available channels and events
- **pusher**: A configured Pusher client instance

### Returns

Returns a `TypedPusherClient` instance with type-safe methods.

### Example

```typescript
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { registry } from './registry'

const pusher = new Pusher('your-key', {
  cluster: 'your-cluster'
})

const client = createClient(registry, pusher)
```

## TypedPusherClient

The main client interface for subscribing to channels and managing connections.

### Methods

#### subscribe

Subscribes to a channel and returns a typed channel instance.

```typescript
subscribe<Ch extends ChannelSpecifier<Registry>>(
  channelSpec: Ch
): TypedChannel<Registry, Ch>
```

**Parameters:**
- **channelSpec**: Channel name (string) or dynamic channel specification object

**Example:**

```typescript
// Static channel
const userChannel = client.subscribe('user-events')

// Dynamic channel
const roomChannel = client.subscribe({
  template: 'room-{roomId}',
  params: { roomId: 'room123' }
})
```

#### disconnect

Disconnects from all channels and closes the Pusher connection.

```typescript
disconnect(): void
```

**Example:**

```typescript
// Clean up when component unmounts or app closes
client.disconnect()
```

## TypedChannel

Represents a subscribed channel with type-safe event binding and triggering.

### Methods

#### bind

Binds an event handler to a specific event on the channel.

```typescript
bind<Ev extends EventNames<Registry, Ch>>(
  event: Ev,
  handler: (payload: OutType<Registry, Ch, Ev>) => void
): void
```

**Parameters:**
- **event**: The event name to bind to
- **handler**: Function to call when the event is received

**Example:**

```typescript
const channel = client.subscribe('user-events')

channel.bind('user-joined', (data) => {
  // data is typed as { userId: string, username: string, timestamp: number }
  console.log(`${data.username} joined at ${new Date(data.timestamp)}`)
})

channel.bind('user-left', (data) => {
  // data is typed as { userId: string, timestamp: number }
  console.log(`User ${data.userId} left`)
})
```

#### unbind

Removes event handler for a specific event.

```typescript
unbind<Ev extends EventNames<Registry, Ch>>(event: Ev): void
```

**Parameters:**
- **event**: The event name to unbind

**Example:**

```typescript
// Remove handler for specific event
channel.unbind('user-joined')
```

#### trigger

Triggers an event on the channel (for client-side triggering if enabled).

```typescript
trigger<Ev extends EventNames<Registry, Ch>>(
  event: Ev,
  data: InType<Registry, Ch, Ev>
): Promise<void>
```

**Parameters:**
- **event**: The event name to trigger
- **data**: The event payload (validated against schema)

**Example:**

```typescript
const channel = client.subscribe('chat-room')

// Trigger a typing indicator
await channel.trigger('typing', {
  userId: 'user123',
  isTyping: true
})
```

## Channel Specifications

### Static Channels

For channels with fixed names:

```typescript
const channel = client.subscribe('notifications')
```

### Dynamic Channels

For channels with parameters:

```typescript
// Single parameter
const userChannel = client.subscribe({
  template: 'user-{userId}',
  params: { userId: 'user123' }
})

// Multiple parameters
const roomUserChannel = client.subscribe({
  template: 'room-{roomId}-user-{userId}',
  params: { roomId: 'room456', userId: 'user123' }
})
```

## Error Handling

### Invalid Channel Names

```typescript
try {
  const channel = client.subscribe('unknown-channel' as any)
  channel.bind('some-event', () => {})
} catch (error) {
  console.error(error.message) // "Could not find channel unknown-channel"
}
```

### Invalid Event Names

```typescript
try {
  const channel = client.subscribe('user-events')
  channel.bind('unknown-event' as any, () => {})
} catch (error) {
  console.error(error.message) // "Could not find schema for event unknown-event"
}
```

### Invalid Trigger Data

```typescript
try {
  await channel.trigger('user-joined', {
    userId: 123, // Should be string
    username: 'test',
    timestamp: Date.now()
  })
} catch (error) {
  console.error(error.message) // "Trying to send invalid data: [...]"
}
```

### Invalid Incoming Data

Invalid incoming data is automatically handled by logging a warning and ignoring the event:

```typescript
channel.bind('user-joined', (data) => {
  // This handler will only be called with valid data
})

// Invalid data from server will log:
// "Received invalid payload [validation errors]"
```

## React Integration

### Custom Hook Example

```typescript
import { useEffect, useState } from 'react'
import { client } from './pusher-client'

function useRealtimeData<T>(
  channelName: string,
  eventName: string,
  initialData: T
): T {
  const [data, setData] = useState<T>(initialData)

  useEffect(() => {
    const channel = client.subscribe(channelName)
    
    channel.bind(eventName, (newData: T) => {
      setData(newData)
    })

    return () => {
      channel.unbind(eventName)
    }
  }, [channelName, eventName])

  return data
}

// Usage
function UserProfile({ userId }: { userId: string }) {
  const userStatus = useRealtimeData(
    { template: 'user-{userId}', params: { userId } },
    'status-changed',
    { status: 'offline', timestamp: 0 }
  )

  return (
    <div>
      Status: {userStatus.status}
      Last seen: {new Date(userStatus.timestamp).toLocaleString()}
    </div>
  )
}
```

### Connection Status Hook

```typescript
import { useEffect, useState } from 'react'
import Pusher from 'pusher-js'

function useConnectionStatus(pusher: Pusher) {
  const [status, setStatus] = useState<string>('connecting')

  useEffect(() => {
    const handleStateChange = (states: any) => {
      setStatus(states.current)
    }

    pusher.connection.bind('state_change', handleStateChange)
    setStatus(pusher.connection.state)

    return () => {
      pusher.connection.unbind('state_change', handleStateChange)
    }
  }, [pusher])

  return status
}
```

## TypeScript Types

### Key Types

```typescript
import type {
  TypedPusherClient,
  TypedChannel,
  ChannelSpecifier,
  EventNames,
  InType,
  OutType
} from '@matfire/concorde'

// Extract types from your registry
type MyChannels = keyof typeof registry
type UserEvents = EventNames<typeof registry, 'user-events'>
type MessageData = OutType<typeof registry, 'chat-room', 'message'>
```

### Type Guards

```typescript
function isValidChannelSpec(
  spec: unknown
): spec is ChannelSpecifier<typeof registry> {
  return typeof spec === 'string' || 
         (typeof spec === 'object' && 
          spec !== null && 
          'template' in spec && 
          'params' in spec)
}
```

## Next Steps

- [Server API](/api/server) - Learn about server-side triggering
- [Registry Builder](/api/registry) - Advanced registry patterns
- [Types Reference](/api/types) - Complete type definitions