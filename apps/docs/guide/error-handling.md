# Error Handling

Concorde provides comprehensive error handling for both development and production scenarios. Understanding how to handle different types of errors ensures robust real-time applications.

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

### Graceful Degradation

```typescript
async function broadcastMessage(message: any) {
  const channels = ['channel1', 'channel2', 'channel3']
  const results = await Promise.allSettled(
    channels.map(channel => 
      server.trigger(channel, 'message', message)
    )
  )
  
  const successful = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  
  console.log(`Broadcast: ${successful} successful, ${failed} failed`)
  
  // Log failed channels for retry
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Channel ${channels[index]} failed:`, result.reason)
    }
  })
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

### Subscription Error Handling

```typescript
function safeSubscribe(channelName: string) {
  try {
    return client.subscribe(channelName)
  } catch (error) {
    console.error(`Failed to subscribe to ${channelName}:`, error.message)
    
    // Fallback to a default channel or show error UI
    showSubscriptionError(channelName)
    return null
  }
}

function safeBind(channel: any, event: string, handler: Function) {
  if (!channel) return
  
  try {
    channel.bind(event, handler)
  } catch (error) {
    console.error(`Failed to bind to ${event}:`, error.message)
  }
}
```

## Production Error Handling

### Monitoring and Logging

```typescript
interface ErrorContext {
  userId?: string
  channel?: string
  event?: string
  data?: unknown
  timestamp: number
}

function logError(error: Error, context: ErrorContext) {
  const errorData = {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: Date.now()
  }
  
  // Send to monitoring service
  console.error('Concorde Error:', errorData)
  
  // Send to external monitoring (e.g., Sentry, DataDog)
  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.captureException(error, {
      tags: {
        component: 'concorde',
        channel: context.channel,
        event: context.event
      },
      extra: context
    })
  }
}
```

### Retry Logic

```typescript
async function triggerWithRetry(
  channel: string, 
  event: string, 
  data: unknown,
  maxRetries = 3
) {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await server.trigger(channel, event, data)
      return true
    } catch (error) {
      lastError = error as Error
      
      // Don't retry validation errors
      if (error.message.includes('Trying to send invalid data')) {
        throw error
      }
      
      console.warn(`Attempt ${attempt} failed:`, error.message)
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        )
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`)
}
```

### Circuit Breaker Pattern

```typescript
class ConcordeCircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly threshold = 5
  private readonly timeout = 60000 // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open')
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold && 
           Date.now() - this.lastFailureTime < this.timeout
  }

  private onSuccess(): void {
    this.failures = 0
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
  }
}

const circuitBreaker = new ConcordeCircuitBreaker()

// Usage
try {
  await circuitBreaker.execute(() => 
    server.trigger('notifications', 'alert', alertData)
  )
} catch (error) {
  console.error('Circuit breaker prevented execution or operation failed')
}
```

## Testing Error Scenarios

### Unit Tests for Error Handling

```typescript
import { describe, it, expect } from 'vitest'
import { createServer } from '@matfire/concorde/server'

describe('Error Handling', () => {
  it('should throw validation error for invalid data', async () => {
    const server = createServer(registry, mockPusher)
    
    await expect(
      server.trigger('user-events', 'user-joined', {
        userId: 123, // Invalid type
        username: 'test',
        timestamp: Date.now()
      })
    ).rejects.toThrow('Trying to send invalid data')
  })

  it('should handle unknown channels gracefully', () => {
    const client = createClient(registry, mockPusher)
    
    expect(() => {
      const channel = client.subscribe('unknown-channel' as any)
      channel.bind('event', () => {})
    }).toThrow('Could not find channel unknown-channel')
  })
})
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
- Explore [Real-time Chat Example](/examples/chat)
- Check out the [Server API](/api/server) reference