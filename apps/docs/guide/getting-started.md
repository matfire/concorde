# Getting Started

Concorde is a TypeScript wrapper for Pusher that provides end-to-end type safety with schema validation. It ensures that your real-time events are type-safe from server to client and vice versa.

## Installation

Install Concorde alongside your Pusher dependencies:

::: code-group

```bash [npm]
npm install @matfire/concorde pusher pusher-js
```

```bash [yarn]
yarn add @matfire/concorde pusher pusher-js
```

```bash [pnpm]
pnpm add @matfire/concorde pusher pusher-js
```

```bash [bun]
bun add @matfire/concorde pusher pusher-js
```

:::

## Quick Start

### 1. Define Your Schema Registry

First, create a registry that defines your channels and their events with schemas:

```typescript
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

// Define your channel registry
export const registry = new RegistryBuilder()
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
  .channel('chat-room', {
    message: type({
      messageId: 'string',
      userId: 'string',
      content: 'string',
      timestamp: 'number'
    })
  })
  .build()
```

### 2. Server Setup

Create a type-safe server instance:

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

// Type-safe event triggering
await server.trigger('user-events', 'user-joined', {
  userId: 'user123',
  username: 'john_doe',
  timestamp: Date.now()
})
```

### 3. Client Setup

Create a type-safe client instance:

```typescript
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { registry } from './registry'

const pusher = new Pusher('your-key', {
  cluster: 'your-cluster'
})

const client = createClient(registry, pusher)

// Type-safe channel subscription and event binding
const channel = client.subscribe('user-events')

channel.bind('user-joined', (data) => {
  // data is automatically typed as:
  // { userId: string, username: string, timestamp: number }
  console.log(`${data.username} joined at ${data.timestamp}`)
})
```

## Key Benefits

- **🔒 Type Safety**: Full TypeScript type inference for all events
- **📐 Schema Validation**: Automatic validation of all data using StandardSchema
- **🚀 Developer Experience**: Excellent IntelliSense and error messages
- **🔌 Drop-in Replacement**: Works with existing Pusher infrastructure
- **🛡️ Runtime Safety**: Prevents invalid data from being sent or processed

## Next Steps

- Learn about [Basic Usage](/guide/basic-usage) patterns
- Understand [Schema Validation](/guide/schema-validation) in detail
- Explore [Dynamic Channels](/guide/dynamic-channels) for scalable applications