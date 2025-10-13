# Types Reference

Complete TypeScript type definitions for Concorde's type system.

## Core Types

### ChannelDef

Defines a channel with its name and events.

```typescript
type ChannelDef<
  Name extends string = string,
  Events extends Record<string, StandardSchemaV1> = Record<string, StandardSchemaV1>
> = {
  name: Name
  events: Events
}
```

**Example:**

```typescript
const userEventsChannel: ChannelDef<'user-events', {
  'user-joined': ArkType<{ userId: string, username: string }>
}> = {
  name: 'user-events',
  events: {
    'user-joined': type({ userId: 'string', username: 'string' })
  }
}
```

### ChannelSpecifier

Union type for specifying channels (static or dynamic).

```typescript
type ChannelSpecifier<Registry> = 
  | StaticChannelNames<Registry>
  | DynamicChannelSpec<Registry>
```

**Example:**

```typescript
// Static channel
const staticChannel: ChannelSpecifier<Registry> = 'user-events'

// Dynamic channel
const dynamicChannel: ChannelSpecifier<Registry> = {
  template: 'user-{userId}',
  params: { userId: 'user123' }
}
```

## Dynamic Channel Types

### ExtractParams

Extracts parameter names from a template string.

```typescript
type ExtractParams<T extends string> = 
  T extends `${string}{${infer P}}${infer Rest}`
    ? { [K in P]: string } & ExtractParams<Rest>
    : {}
```

**Examples:**

```typescript
type SingleParam = ExtractParams<'user-{userId}'>
// Result: { userId: string }

type MultiParam = ExtractParams<'room-{roomId}-user-{userId}'>
// Result: { roomId: string, userId: string }

type NoParams = ExtractParams<'static-channel'>
// Result: {}
```

### HasParams

Checks if a template string contains dynamic parameters.

```typescript
type HasParams<T extends string> = ExtractParams<T> extends {}
  ? keyof ExtractParams<T> extends never
    ? false
    : true
  : false
```

**Examples:**

```typescript
type Static = HasParams<'user-events'>        // false
type Dynamic = HasParams<'user-{userId}'>     // true
type MultiDynamic = HasParams<'room-{roomId}-user-{userId}'> // true
```

### DynamicChannel

Represents a dynamic channel specification.

```typescript
type DynamicChannel<Template extends string> = {
  template: Template
  params: ExtractParams<Template>
}
```

**Example:**

```typescript
const roomChannel: DynamicChannel<'room-{roomId}-user-{userId}'> = {
  template: 'room-{roomId}-user-{userId}',
  params: { roomId: 'room123', userId: 'user456' }
}
```

## Channel Name Helpers

### StaticChannelNames

Extracts static (non-parameterized) channel names from a registry.

```typescript
type StaticChannelNames<T> = T extends Record<string, ChannelDef>
  ? {
      [K in keyof T]: HasParams<K & string> extends false ? K : never
    }[keyof T] & string
  : never
```

### DynamicChannelNames

Extracts dynamic (parameterized) channel names from a registry.

```typescript
type DynamicChannelNames<T> = T extends Record<string, ChannelDef>
  ? {
      [K in keyof T]: HasParams<K & string> extends true ? K : never
    }[keyof T] & string
  : never
```

### ChannelNames

Extracts all channel names from a registry.

```typescript
type ChannelNames<T> = T extends Record<string, ChannelDef>
  ? keyof T & string
  : never
```

**Example:**

```typescript
const registry = {
  'user-events': { /* ... */ },        // Static
  'notifications': { /* ... */ },      // Static  
  'user-{userId}': { /* ... */ },      // Dynamic
  'room-{roomId}': { /* ... */ }       // Dynamic
} as const

type Static = StaticChannelNames<typeof registry>
// Result: 'user-events' | 'notifications'

type Dynamic = DynamicChannelNames<typeof registry>
// Result: 'user-{userId}' | 'room-{roomId}'

type All = ChannelNames<typeof registry>
// Result: 'user-events' | 'notifications' | 'user-{userId}' | 'room-{roomId}'
```

## Event and Data Types

### EventNames

Extracts event names for a specific channel.

```typescript
type EventNames<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<string, infer Ev>
    ? keyof Ev & string
    : never
  : never
```

### InType

The input type for triggering events (what you pass to `trigger`).

```typescript
type InType<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>,
  Ev extends EventNames<Registry, ChSpec>
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<string, infer E>
    ? Ev extends keyof E
      ? E[Ev] extends StandardSchemaV1
        ? StandardSchemaV1.InferInput<E[Ev]>
        : never
      : never
    : never
  : never
```

### OutType

The output type for receiving events (what your handlers receive).

```typescript
type OutType<
  Registry,
  ChSpec extends ChannelSpecifier<Registry>,
  Ev extends EventNames<Registry, ChSpec>
> = ResolveChannelTemplate<Registry, ChSpec> extends keyof Registry
  ? Registry[ResolveChannelTemplate<Registry, ChSpec>] extends ChannelDef<string, infer E>
    ? Ev extends keyof E
      ? E[Ev] extends StandardSchemaV1
        ? StandardSchemaV1.InferOutput<E[Ev]>
        : never
      : never
    : never
  : never
```

**Example:**

```typescript
const registry = {
  'chat-room': {
    name: 'chat-room' as const,
    events: {
      message: type({
        content: 'string',
        userId: 'string',
        timestamp: 'number'
      })
    }
  }
} as const

type MessageInput = InType<typeof registry, 'chat-room', 'message'>
// Result: { content: string, userId: string, timestamp: number }

type MessageOutput = OutType<typeof registry, 'chat-room', 'message'>
// Result: { content: string, userId: string, timestamp: number }

type ChatEvents = EventNames<typeof registry, 'chat-room'>
// Result: 'message'
```

## Client and Server Types

### TypedPusherClient

The main client interface.

```typescript
type TypedPusherClient<Registry> = {
  subscribe<Ch extends ChannelSpecifier<Registry>>(
    channelSpec: Ch
  ): TypedChannel<Registry, Ch>
  disconnect(): void
}
```

### TypedChannel

Interface for subscribed channels.

```typescript
type TypedChannel<Registry, Ch extends ChannelSpecifier<Registry>> = {
  bind<Ev extends EventNames<Registry, Ch>>(
    event: Ev,
    handler: (payload: OutType<Registry, Ch, Ev>) => void
  ): void
  unbind<Ev extends EventNames<Registry, Ch>>(event: Ev): void
  trigger<Ev extends EventNames<Registry, Ch>>(
    event: Ev,
    data: InType<Registry, Ch, Ev>
  ): void
}
```

### TypedPusherServer

The main server interface.

```typescript
type TypedPusherServer<Registry> = {
  trigger<
    Ch extends ChannelSpecifier<Registry>,
    Ev extends EventNames<Registry, Ch>
  >(
    channel: Ch | Ch[],
    event: Ev,
    data: InType<Registry, Ch, Ev>
  ): Promise<Pusher.Response>
}
```

## Utility Types

### ResolveChannelTemplate

Maps channel specifiers to their template names for registry lookup.

```typescript
type ResolveChannelTemplate<Registry, ChSpec> = ChSpec extends string
  ? ChSpec extends keyof Registry
    ? ChSpec
    : never
  : ChSpec extends DynamicChannel<infer Template>
    ? Template extends keyof Registry
      ? Template
      : never
    : never
```

### DynamicChannelSpec

All possible dynamic channel specifications for a registry.

```typescript
type DynamicChannelSpec<Registry> = Registry extends Record<string, ChannelDef>
  ? {
      [K in keyof Registry]: HasParams<K & string> extends true
        ? DynamicChannel<K & string>
        : never
    }[keyof Registry]
  : never
```


## Next Steps

- [Client API](/api/client) - Using types with the client
- [Server API](/api/server) - Using types with the server
- [Registry Builder](/api/registry) - Building type-safe registries