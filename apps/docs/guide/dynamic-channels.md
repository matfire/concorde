# Dynamic Channels

Dynamic channels allow you to create parameterized channel names with full type safety. This is essential for building scalable real-time applications where channels need to be created dynamically based on user IDs, room IDs, or other parameters.

## Channel Templates

Define channel templates using parameter placeholders in curly braces:

```typescript
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const registry = new RegistryBuilder()
  // Static channel
  .channel('global-notifications', {
    alert: type({
      message: 'string',
      level: "'info' | 'warning' | 'error'"
    })
  })
  // Dynamic channel with single parameter
  .channel('user-{userId}', {
    'profile-update': type({
      userId: 'string',
      data: 'object'
    }),
    notification: type({
      message: 'string',
      timestamp: 'number'
    })
  })
  // Dynamic channel with multiple parameters
  .channel('room-{roomId}-user-{userId}', {
    message: type({
      content: 'string',
      timestamp: 'number',
      senderId: 'string'
    }),
    typing: type({
      isTyping: 'boolean'
    })
  })
  .build()
```

## Using Dynamic Channels

### Server-Side Usage

```typescript
import { createServer } from '@matfire/concorde/server'

const server = createServer(registry, pusher)

// Trigger to a dynamic channel
await server.trigger(
  { template: 'user-{userId}', params: { userId: 'user123' } },
  'notification',
  {
    message: 'You have a new message',
    timestamp: Date.now()
  }
)

// Multiple dynamic channels
await server.trigger(
  [
    { template: 'user-{userId}', params: { userId: 'user123' } },
    { template: 'user-{userId}', params: { userId: 'user456' } }
  ],
  'notification',
  {
    message: 'System maintenance scheduled',
    timestamp: Date.now()
  }
)

// Multi-parameter channel
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

### Client-Side Usage

```typescript
import { createClient } from '@matfire/concorde/client'

const client = createClient(registry, pusher)

// Subscribe to dynamic channel
const userChannel = client.subscribe({
  template: 'user-{userId}',
  params: { userId: 'user123' }
})

userChannel.bind('notification', (data) => {
  console.log('Notification:', data.message)
})

// Multi-parameter channel subscription
const roomUserChannel = client.subscribe({
  template: 'room-{roomId}-user-{userId}',
  params: { roomId: 'room456', userId: 'user123' }
})

roomUserChannel.bind('message', (data) => {
  console.log('Message:', data.content)
})

roomUserChannel.bind('typing', (data) => {
  console.log('Typing status:', data.isTyping)
})
```

## Type Safety

Dynamic channels maintain full type safety:

```typescript
// ✅ Correct parameter types
const channel = client.subscribe({
  template: 'user-{userId}',
  params: { userId: 'user123' } // userId must be string
})

// ❌ TypeScript error - missing parameter
const invalidChannel = client.subscribe({
  template: 'user-{userId}',
  params: {} // Error: Property 'userId' is missing
})

// ❌ TypeScript error - wrong parameter name
const wrongChannel = client.subscribe({
  template: 'user-{userId}',
  params: { id: 'user123' } // Error: 'id' does not exist, did you mean 'userId'?
})
```

## Channel Name Resolution

Dynamic channels are resolved to actual channel names at runtime:

```typescript
// Template: 'user-{userId}'
// Params: { userId: 'user123' }
// Resolved: 'user-user123'

// Template: 'room-{roomId}-user-{userId}'
// Params: { roomId: 'room456', userId: 'user789' }
// Resolved: 'room-room456-user-user789'
```

## Real-World Examples

### User-Specific Notifications

```typescript
// Registry definition
const registry = new RegistryBuilder()
  .channel('notifications-{userId}', {
    'friend-request': type({
      fromUserId: 'string',
      fromUsername: 'string',
      timestamp: 'number'
    }),
    'message-received': type({
      fromUserId: 'string',
      content: 'string',
      chatId: 'string'
    })
  })
  .build()

// Server: Send notification to specific user
await server.trigger(
  { template: 'notifications-{userId}', params: { userId: targetUserId } },
  'friend-request',
  {
    fromUserId: currentUserId,
    fromUsername: currentUser.username,
    timestamp: Date.now()
  }
)

// Client: Subscribe to own notifications
const notificationsChannel = client.subscribe({
  template: 'notifications-{userId}',
  params: { userId: currentUserId }
})

notificationsChannel.bind('friend-request', (request) => {
  showFriendRequestNotification(request)
})
```

### Chat Rooms

```typescript
// Registry definition
const registry = new RegistryBuilder()
  .channel('chat-{roomId}', {
    message: type({
      messageId: 'string',
      userId: 'string',
      username: 'string',
      content: 'string',
      timestamp: 'number'
    }),
    'user-joined': type({
      userId: 'string',
      username: 'string'
    }),
    'user-left': type({
      userId: 'string',
      username: 'string'
    })
  })
  .build()

// Server: Broadcast to room
await server.trigger(
  { template: 'chat-{roomId}', params: { roomId: 'general' } },
  'message',
  {
    messageId: generateId(),
    userId: sender.id,
    username: sender.username,
    content: messageContent,
    timestamp: Date.now()
  }
)

// Client: Join specific room
const chatChannel = client.subscribe({
  template: 'chat-{roomId}',
  params: { roomId: 'general' }
})

chatChannel.bind('message', (message) => {
  displayMessage(message)
})

chatChannel.bind('user-joined', (user) => {
  showUserJoinedNotification(user.username)
})
```

### Multi-Level Hierarchy

```typescript
// Complex hierarchical channels
const registry = new RegistryBuilder()
  .channel('org-{orgId}-team-{teamId}-project-{projectId}', {
    'task-created': type({
      taskId: 'string',
      title: 'string',
      assignedTo: 'string',
      priority: "'low' | 'medium' | 'high'"
    }),
    'status-changed': type({
      taskId: 'string',
      newStatus: "'todo' | 'in-progress' | 'done'",
      changedBy: 'string'
    })
  })
  .build()

// Usage
const projectChannel = client.subscribe({
  template: 'org-{orgId}-team-{teamId}-project-{projectId}',
  params: {
    orgId: 'acme-corp',
    teamId: 'backend',
    projectId: 'api-v2'
  }
})
```

## Best Practices

1. **Use Descriptive Parameters**: Choose clear parameter names like `{userId}` not `{id}`
2. **Consistent Naming**: Follow a consistent pattern across your channel templates
3. **Avoid Deep Nesting**: Keep parameter hierarchies reasonably shallow
4. **Parameter Validation**: Ensure parameters are validated before channel creation
5. **Documentation**: Document your channel naming conventions

## Limitations

- Parameters must be strings
- Parameter names must be valid TypeScript identifiers
- Channel names have Pusher's length limitations (max 200 characters)
- Parameters cannot contain special characters that would break channel names

## Next Steps

- Learn about [Error Handling](/guide/error-handling)
- Check out [Best Practices](/guide/best-practices)
- See [Real-time Chat Example](/examples/chat) using dynamic channels