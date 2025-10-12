# Schema Validation

Concorde uses [StandardSchema](https://github.com/standard-schema/standard-schema) to provide runtime validation of all event data. This ensures that both incoming and outgoing messages conform to your defined types.

## Schema Definition

Schemas are defined using any StandardSchema-compatible library. We recommend [ArkType](https://arktype.io/) for its excellent TypeScript integration:

```typescript
import { type } from 'arktype'

const userSchema = type({
  userId: 'string',
  username: 'string',
  email: 'email', // Built-in email validation
  age: 'number',
  status: "'active' | 'inactive' | 'pending'"
})
```

## Supported Schema Libraries

Concorde works with any StandardSchema-compatible validation library:

### ArkType (Recommended)

```typescript
import { type } from 'arktype'

const messageSchema = type({
  content: 'string>0', // Non-empty string
  timestamp: 'number',
  priority: "'low' | 'medium' | 'high'"
})
```

### Zod

```typescript
import { z } from 'zod'

const messageSchema = z.object({
  content: z.string().min(1),
  timestamp: z.number(),
  priority: z.enum(['low', 'medium', 'high'])
})
```

### Valibot

```typescript
import * as v from 'valibot'

const messageSchema = v.object({
  content: v.pipe(v.string(), v.minLength(1)),
  timestamp: v.number(),
  priority: v.picklist(['low', 'medium', 'high'])
})
```

## Validation Flow

### Server-Side Validation

When triggering events from the server, data is validated before being sent to Pusher:

```typescript
// ✅ Valid data - will be sent
await server.trigger('chat', 'message', {
  content: 'Hello world!',
  timestamp: Date.now(),
  priority: 'medium'
})

// ❌ Invalid data - will throw an error
await server.trigger('chat', 'message', {
  content: '', // Empty string not allowed
  timestamp: 'invalid', // Should be number
  priority: 'urgent' // Not in enum
})
// Throws: "Trying to send invalid data: [validation errors]"
```

### Client-Side Validation

#### Outgoing Data (Client Triggers)

```typescript
const channel = client.subscribe('chat')

// ✅ Valid data
await channel.trigger('message', {
  content: 'Hello!',
  timestamp: Date.now(),
  priority: 'low'
})

// ❌ Invalid data
await channel.trigger('message', {
  content: 123, // Should be string
  timestamp: Date.now(),
  priority: 'low'
})
// Throws: "Trying to send invalid data: [validation errors]"
```

#### Incoming Data (Server Events)

```typescript
channel.bind('message', (data) => {
  // This handler will only be called if data is valid
  // data is guaranteed to match the schema
  console.log(data.content) // Always a string
})

// If invalid data is received, it's logged and ignored:
// Console warning: "Received invalid payload [validation errors]"
```

## Advanced Schema Patterns

### Optional Fields

```typescript
const userProfileSchema = type({
  userId: 'string',
  username: 'string',
  avatar: 'string | undefined', // Optional field
  'preferences?': { // Optional object
    theme: "'light' | 'dark'",
    notifications: 'boolean'
  }
})
```

### Nested Objects

```typescript
const orderSchema = type({
  orderId: 'string',
  customer: {
    id: 'string',
    name: 'string',
    email: 'email'
  },
  items: [{
    productId: 'string',
    quantity: 'number>0',
    price: 'number>0'
  }],
  total: 'number>0'
})
```

### Array Validation

```typescript
const notificationSchema = type({
  id: 'string',
  recipients: 'string[]', // Array of strings
  tags: "'urgent' | 'normal' | 'low'[]", // Array of enum values
  metadata: 'object' // Any object
})
```

### Custom Validation

```typescript
const eventSchema = type({
  timestamp: 'number',
  data: 'object'
}).pipe((data) => {
  // Custom validation logic
  if (data.timestamp > Date.now()) {
    return { success: false, issues: ['Timestamp cannot be in the future'] }
  }
  return { success: true, data }
})
```

## Error Messages

Concorde provides detailed error messages for validation failures:

```typescript
try {
  await server.trigger('user-events', 'user-joined', {
    userId: 123, // Should be string
    username: '', // Empty string
    timestamp: 'invalid' // Should be number
  })
} catch (error) {
  console.log(error.message)
  // "Trying to send invalid data: [
  //   { path: ['userId'], message: 'Expected string, got number' },
  //   { path: ['username'], message: 'String must not be empty' },
  //   { path: ['timestamp'], message: 'Expected number, got string' }
  // ]"
}
```

## Performance Considerations

- **Validation Cost**: Schema validation happens once per event
- **Schema Caching**: Schemas are cached for optimal performance
- **Async Validation**: Validation is asynchronous and non-blocking
- **Memory Usage**: Minimal overhead with efficient schema compilation

## Best Practices

1. **Use Strict Schemas**: Define precise constraints for better validation
2. **Keep Schemas Simple**: Complex nested structures can impact performance
3. **Version Your Schemas**: Plan for schema evolution in production
4. **Test Validation**: Write tests for both valid and invalid data
5. **Handle Failures Gracefully**: Always catch validation errors on the server

## Type Inference

Concorde automatically infers TypeScript types from your schemas:

```typescript
const messageSchema = type({
  content: 'string',
  timestamp: 'number',
  author: {
    id: 'string',
    name: 'string'
  }
})

// TypeScript automatically knows the shape:
channel.bind('message', (data) => {
  // data: { content: string, timestamp: number, author: { id: string, name: string } }
  console.log(data.author.name) // Type-safe access
})
```

## Next Steps

- Learn about [Dynamic Channels](/guide/dynamic-channels)
- Explore [Error Handling](/guide/error-handling) strategies
- Check out the [Registry Builder API](/api/registry)