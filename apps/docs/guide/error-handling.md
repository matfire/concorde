# Error Handling

Concorde provides comprehensive error handling for both development and production scenarios. Understanding how to handle different types of errors ensures robust real-time applications.

::: warning
  :warning: this section is still a work in progress
:::

## Types of Errors

### 1. Schema Validation Errors

These occur when data doesn't match the defined schema:

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

### 2. Channel Not Found Errors

When trying to use undefined channels:

```typescript
try {
  const channel = client.subscribe('unknown-channel' as any)
  channel.bind('some-event', () => {})
} catch (error) {
  console.error(error.message)
  // "Could not find channel unknown-channel"
}
```

### 3. Event Not Found Errors

When trying to use undefined events:

```typescript
try {
  const channel = client.subscribe('user-events')
  channel.bind('unknown-event' as any, () => {})
} catch (error) {
  console.error(error.message)
  // "Could not find schema for event unknown-event"
}
```

### 4. Pusher Connection Errors

Native Pusher errors are passed through:

```typescript
// These are handled by the underlying Pusher library
pusher.connection.bind('error', (error) => {
  console.error('Pusher connection error:', error)
})
```

## Server-Side Error Handling

### Comprehensive Error Handling

```typescript
import { createServer } from '@matfire/concorde/server'

const server = createServer(registry, pusher)

async function sendNotification(userId: string, message: unknown) {
  try {
    await server.trigger(
      { template: 'user-{userId}', params: { userId } },
      'notification',
      message
    )
    console.log('Notification sent successfully')
  } catch (error) {
    if (error.message.includes('Trying to send invalid data')) {
      console.error('Invalid notification data:', error.message)
      // Log to monitoring service
      logValidationError(error, { userId, message })
    } else if (error.message.includes('Unknown event')) {
      console.error('Event not found:', error.message)
    } else {
      console.error('Pusher error:', error)
      // Handle Pusher-specific errors
    }
    
    // Don't let errors crash the application
    return false
  }
  
  return true
}
```

### Validation Error Details

```typescript
async function handleValidationError(error: Error) {
  if (error.message.includes('Trying to send invalid data')) {
    // Parse validation errors for detailed handling
    const errorMatch = error.message.match(/\[(.*)\]/)
    if (errorMatch) {
      try {
        const validationErrors = JSON.parse(errorMatch[1])
        
        for (const validationError of validationErrors) {
          console.log(`Field: ${validationError.path.join('.')}`)
          console.log(`Error: ${validationError.message}`)
        }
      } catch (parseError) {
        console.error('Could not parse validation errors')
      }
    }
  }
}
```


## Client-Side Error Handling

### Invalid Incoming Data

Concorde automatically handles invalid incoming data by logging warnings and ignoring the events:

```typescript
const channel = client.subscribe('user-events')

// Set up custom warning handler
const originalWarn = console.warn
console.warn = (message, ...args) => {
  if (message === 'Received invalid payload') {
    // Handle invalid data gracefully
    logInvalidDataReceived(args[0])
  }
  originalWarn(message, ...args)
}

channel.bind('user-joined', (data) => {
  // This will only be called with valid data
  console.log('Valid user joined:', data)
})
```

### Connection Error Handling

```typescript
import Pusher from 'pusher-js'

const pusher = new Pusher('your-key', {
  cluster: 'your-cluster'
})

// Handle connection states
pusher.connection.bind('error', (error) => {
  console.error('Connection error:', error)
  showConnectionError()
})

pusher.connection.bind('disconnected', () => {
  console.log('Disconnected from Pusher')
  showOfflineIndicator()
})

pusher.connection.bind('connected', () => {
  console.log('Connected to Pusher')
  hideOfflineIndicator()
})

const client = createClient(registry, pusher)
```


## Best Practices

1. **Validate Early**: Catch validation errors as close to the source as possible
2. **Log Everything**: Comprehensive logging helps debug production issues
3. **Graceful Degradation**: Don't let validation errors crash your application
4. **Monitor Errors**: Set up alerts for validation failures and connection issues
5. **Test Error Paths**: Write tests for both success and failure scenarios
6. **User Feedback**: Provide meaningful error messages to users when appropriate

## Next Steps

- Learn about [Best Practices](/guide/best-practices)
- Check out the [Server API](/api/server) reference