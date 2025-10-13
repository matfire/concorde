# Registry Builder API

The Registry Builder provides a fluent API for constructing channel registries with full type safety.

## RegistryBuilder

A builder class for constructing type-safe channel registries.

```typescript
import { RegistryBuilder } from '@matfire/concorde/registry'

class RegistryBuilder<TChannels = {}>
```

### Constructor

```typescript
constructor(channels?: TChannels)
```

Creates a new registry builder, optionally starting with existing channels.

```typescript
const builder = new RegistryBuilder()

// Or start with existing channels
const existingChannels = { /* ... */ }
const builder = new RegistryBuilder(existingChannels)
```

## Methods

### channel

Adds a new channel definition to the registry.

```typescript
channel<Name extends string, Events extends Record<string, StandardSchemaV1>>(
  name: Name,
  events: Events
): RegistryBuilder<TChannels & Record<Name, ChannelDef<Name, Events>>>
```

**Parameters:**
- **name**: The channel name (can include dynamic parameters like `"user-{userId}"`)
- **events**: Object mapping event names to their schemas

**Returns:**
A new RegistryBuilder instance with the added channel

### build

Finalizes the registry and returns the complete channel definitions.

```typescript
build(): TChannels
```

**Returns:**
The complete registry object

## Usage Examples

### Basic Registry Construction

```typescript
import { RegistryBuilder } from '@matfire/concorde/registry'
import { type } from 'arktype'

const registry = new RegistryBuilder()
  .channel('user-events', {
    'user-joined': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    'user-left': type({
      userId: 'string',
      timestamp: 'number'
    })
  })
  .channel('notifications', {
    alert: type({
      id: 'string',
      type: "'info' | 'warning' | 'error'",
      message: 'string',
      timestamp: 'number'
    })
  })
  .build()
```

### Dynamic Channels

```typescript
const registry = new RegistryBuilder()
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

### Complex Schema Validation

```typescript
const registry = new RegistryBuilder()
  .channel('chat-room', {
    message: type({
      messageId: 'string',
      content: 'string>0', // Non-empty string
      userId: 'string',
      timestamp: 'number',
      attachments: [{
        type: "'image' | 'file' | 'link'",
        url: 'string',
        'metadata?': 'object'
      }],
      'replyTo?': 'string | undefined'
    }),
    'user-status': type({
      userId: 'string',
      status: "'online' | 'away' | 'busy' | 'offline'",
      lastSeen: 'number'
    }),
    reaction: type({
      messageId: 'string',
      userId: 'string',
      emoji: 'string',
      timestamp: 'number'
    })
  })
  .build()
```


## Type Safety Features

### Compile-Time Channel Validation

```typescript
const registry = new RegistryBuilder()
  .channel('valid-channel', {
    'valid-event': type({ data: 'string' })
  })
  // .channel('valid-channel', { ... }) // ❌ TypeScript error: Duplicate channel name
  .build()
```

### Event Name Validation

```typescript
// TypeScript ensures event names are valid
type UserEvents = (typeof registry)['user-events']['events']
type EventNames = keyof UserEvents // 'user-joined' | 'user-left'
```

### Schema Type Inference

```typescript
// TypeScript infers the complete registry type
type Registry = typeof registry
type ChannelNames = keyof Registry
type UserChannelEvents = Registry['user-events']['events']
```

## Integration with Schema Libraries

### ArkType Integration

```typescript
import { type } from 'arktype'

const registry = new RegistryBuilder()
  .channel('products', {
    'price-update': type({
      productId: 'string',
      oldPrice: 'number>0',
      newPrice: 'number>0',
      currency: "'USD' | 'EUR' | 'GBP'",
      timestamp: 'number'
    }),
    'stock-alert': type({
      productId: 'string',
      stock: 'number>=0',
      threshold: 'number>=0'
    })
  })
  .build()
```

### Zod Integration

```typescript
import { z } from 'zod'

const registry = new RegistryBuilder()
  .channel('orders', {
    'order-created': z.object({
      orderId: z.string(),
      customerId: z.string(),
      items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().positive()
      })),
      total: z.number().positive()
    }),
    'order-updated': z.object({
      orderId: z.string(),
      status: z.enum(['pending', 'processing', 'shipped', 'delivered'])
    })
  })
  .build()
```

### Valibot Integration

```typescript
import * as v from 'valibot'

const registry = new RegistryBuilder()
  .channel('analytics', {
    'page-view': v.object({
      userId: v.string(),
      page: v.string(),
      referrer: v.optional(v.string()),
      timestamp: v.number()
    }),
    'conversion': v.object({
      userId: v.string(),
      event: v.string(),
      value: v.number(),
      currency: v.picklist(['USD', 'EUR', 'GBP'])
    })
  })
  .build()
```

## Best Practices

### Organize by Feature

```typescript
// Group related channels together
const registry = new RegistryBuilder()
  // User management
  .channel('user-events', { /* ... */ })
  .channel('user-{userId}', { /* ... */ })
  
  // Chat system
  .channel('chat-{roomId}', { /* ... */ })
  .channel('chat-global', { /* ... */ })
  
  // Notifications
  .channel('notifications', { /* ... */ })
  .channel('admin-notifications', { /* ... */ })
  
  .build()
```

### Use Consistent Naming

```typescript
// Good: Consistent parameter naming
.channel('user-{userId}', { /* ... */ })
.channel('room-{roomId}-user-{userId}', { /* ... */ })
.channel('team-{teamId}-user-{userId}', { /* ... */ })

// Avoid: Inconsistent parameter names
.channel('user-{id}', { /* ... */ })
.channel('room-{room_id}-user-{user_id}', { /* ... */ })
```

### Document Complex Schemas

```typescript
const registry = new RegistryBuilder()
  .channel('webhook-events', {
    // Webhook payload for payment processing
    'payment-completed': type({
      paymentId: 'string',
      amount: 'number>0', // Amount in cents
      currency: "'USD' | 'EUR'", // ISO currency code
      customerId: 'string',
      metadata: 'object', // Additional payment metadata
      timestamp: 'number' // Unix timestamp
    })
  })
  .build()
```

## Error Handling

The Registry Builder provides compile-time type safety, but runtime errors can still occur with invalid schemas:

```typescript
try {
  const registry = new RegistryBuilder()
    .channel('test', {
      'invalid-event': null as any // Invalid schema
    })
    .build()
} catch (error) {
  console.error('Registry construction failed:', error)
}
```

## Next Steps

- [Types Reference](/api/types) - Complete type definitions
- [Client API](/api/client) - Using registries with clients
- [Server API](/api/server) - Using registries with servers