# Real-time Chat Example

This example demonstrates building a complete real-time chat application using Concorde with type-safe event handling.

## Registry Definition

First, let's define our channel registry with all the events we need for a chat application:

```typescript
// shared/registry.ts
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const chatRegistry = new RegistryBuilder()
  // Global chat room
  .channel('chat-global', {
    message: type({
      messageId: 'string',
      userId: 'string',
      username: 'string',
      content: 'string>0', // Non-empty message
      timestamp: 'number',
      'replyTo?': 'string | undefined'
    }),
    'user-joined': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    'user-left': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    typing: type({
      userId: 'string',
      username: 'string',
      isTyping: 'boolean'
    })
  })
  // Private chat rooms
  .channel('chat-room-{roomId}', {
    message: type({
      messageId: 'string',
      userId: 'string',
      username: 'string',
      content: 'string>0',
      timestamp: 'number',
      'replyTo?': 'string | undefined'
    }),
    'user-joined': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    'user-left': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    typing: type({
      userId: 'string',
      username: 'string',
      isTyping: 'boolean'
    }),
    'room-settings-changed': type({
      changedBy: 'string',
      settings: {
        name: 'string',
        description: 'string',
        'private': 'boolean'
      }
    })
  })
  // User presence
  .channel('presence-{userId}', {
    'status-changed': type({
      status: "'online' | 'away' | 'busy' | 'offline'",
      timestamp: 'number'
    }),
    'typing-in-room': type({
      roomId: 'string',
      isTyping: 'boolean'
    })
  })
  .build()

export type ChatRegistry = typeof chatRegistry
```

## Server Implementation

### Express.js Server with Chat API

```typescript
// server/chat-server.ts
import express from 'express'
import Pusher from 'pusher'
import { createServer } from '@matfire/concorde/server'
import { chatRegistry } from '../shared/registry'
import { v4 as uuidv4 } from 'uuid'

const app = express()
app.use(express.json())

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
})

const server = createServer(chatRegistry, pusher)

// In-memory storage (use a real database in production)
const messages = new Map<string, any[]>()
const users = new Map<string, { id: string, username: string, status: string }>()
const rooms = new Map<string, { id: string, name: string, users: Set<string> }>()

// Message endpoints
app.post('/api/chat/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params
    const { userId, content, replyTo } = req.body

    const user = users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const messageId = uuidv4()
    const timestamp = Date.now()

    const message = {
      messageId,
      userId,
      username: user.username,
      content,
      timestamp,
      replyTo
    }

    // Store message
    if (!messages.has(roomId)) {
      messages.set(roomId, [])
    }
    messages.get(roomId)!.push(message)

    // Determine channel based on room type
    const channel = roomId === 'global' 
      ? 'chat-global'
      : { template: 'chat-room-{roomId}' as const, params: { roomId } }

    // Trigger real-time event
    await server.trigger(channel, 'message', message)

    res.json(message)
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ error: 'Failed to send message' })
  }
})

// Join room endpoint
app.post('/api/chat/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params
    const { userId } = req.body

    const user = users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Add user to room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { id: roomId, name: roomId, users: new Set() })
    }
    rooms.get(roomId)!.users.add(userId)

    const joinEvent = {
      userId,
      username: user.username,
      timestamp: Date.now()
    }

    // Determine channel
    const channel = roomId === 'global' 
      ? 'chat-global'
      : { template: 'chat-room-{roomId}' as const, params: { roomId } }

    // Trigger join event
    await server.trigger(channel, 'user-joined', joinEvent)

    res.json({ success: true })
  } catch (error) {
    console.error('Error joining room:', error)
    res.status(500).json({ error: 'Failed to join room' })
  }
})

// Typing indicator endpoint
app.post('/api/chat/:roomId/typing', async (req, res) => {
  try {
    const { roomId } = req.params
    const { userId, isTyping } = req.body

    const user = users.get(userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const typingEvent = {
      userId,
      username: user.username,
      isTyping
    }

    // Determine channel
    const channel = roomId === 'global' 
      ? 'chat-global'
      : { template: 'chat-room-{roomId}' as const, params: { roomId } }

    await server.trigger(channel, 'typing', typingEvent)

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating typing status:', error)
    res.status(500).json({ error: 'Failed to update typing status' })
  }
})

// User management
app.post('/api/users', (req, res) => {
  const { username } = req.body
  const userId = uuidv4()
  
  const user = { id: userId, username, status: 'online' }
  users.set(userId, user)
  
  res.json(user)
})

app.get('/api/chat/:roomId/messages', (req, res) => {
  const { roomId } = req.params
  const roomMessages = messages.get(roomId) || []
  res.json(roomMessages)
})

app.listen(3001, () => {
  console.log('Chat server running on port 3001')
})
```

## React Client Implementation

### Chat Component

```typescript
// client/components/Chat.tsx
import React, { useState, useEffect, useRef } from 'react'
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { chatRegistry } from '../../shared/registry'

// Initialize Pusher client
const pusher = new Pusher(process.env.REACT_APP_PUSHER_KEY!, {
  cluster: process.env.REACT_APP_PUSHER_CLUSTER!
})

const client = createClient(chatRegistry, pusher)

interface Message {
  messageId: string
  userId: string
  username: string
  content: string
  timestamp: number
  replyTo?: string
}

interface User {
  id: string
  username: string
  status: string
}

interface ChatProps {
  roomId: string
  currentUser: User
}

export function Chat({ roomId, currentUser }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()

  // Load initial messages
  useEffect(() => {
    fetch(`/api/chat/${roomId}/messages`)
      .then(res => res.json())
      .then(setMessages)
      .catch(console.error)
  }, [roomId])

  // Set up real-time subscriptions
  useEffect(() => {
    // Determine channel based on room type
    const channelSpec = roomId === 'global' 
      ? 'chat-global'
      : { template: 'chat-room-{roomId}' as const, params: { roomId } }

    const channel = client.subscribe(channelSpec)

    // Message handler
    channel.bind('message', (message: Message) => {
      setMessages(prev => [...prev, message])
    })

    // User joined handler
    channel.bind('user-joined', (event) => {
      setOnlineUsers(prev => new Set([...prev, event.userId]))
      
      // Add system message
      const systemMessage: Message = {
        messageId: `system-${Date.now()}`,
        userId: 'system',
        username: 'System',
        content: `${event.username} joined the chat`,
        timestamp: event.timestamp
      }
      setMessages(prev => [...prev, systemMessage])
    })

    // User left handler
    channel.bind('user-left', (event) => {
      setOnlineUsers(prev => {
        const updated = new Set(prev)
        updated.delete(event.userId)
        return updated
      })

      // Add system message
      const systemMessage: Message = {
        messageId: `system-${Date.now()}`,
        userId: 'system',
        username: 'System',
        content: `${event.username} left the chat`,
        timestamp: event.timestamp
      }
      setMessages(prev => [...prev, systemMessage])
    })

    // Typing indicator handler
    channel.bind('typing', (event) => {
      if (event.userId === currentUser.id) return // Ignore own typing

      setTypingUsers(prev => {
        const updated = new Set(prev)
        if (event.isTyping) {
          updated.add(event.username)
        } else {
          updated.delete(event.username)
        }
        return updated
      })

      // Clear typing indicator after delay
      if (event.isTyping) {
        setTimeout(() => {
          setTypingUsers(prev => {
            const updated = new Set(prev)
            updated.delete(event.username)
            return updated
          })
        }, 3000)
      }
    })

    // Join the room
    fetch(`/api/chat/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    })

    return () => {
      channel.unbind('message')
      channel.unbind('user-joined')
      channel.unbind('user-left')
      channel.unbind('typing')
    }
  }, [roomId, currentUser])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    try {
      await fetch(`/api/chat/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          content: newMessage.trim()
        })
      })

      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  // Handle typing indicator
  const handleTyping = (value: string) => {
    setNewMessage(value)

    // Send typing indicator
    fetch(`/api/chat/${roomId}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        isTyping: value.length > 0
      })
    })

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to stop typing indicator
    if (value.length > 0) {
      typingTimeoutRef.current = setTimeout(() => {
        fetch(`/api/chat/${roomId}/typing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            isTyping: false
          })
        })
      }, 1000)
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>{roomId === 'global' ? 'Global Chat' : `Room: ${roomId}`}</h2>
        <div className="online-count">
          {onlineUsers.size} users online
        </div>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div 
            key={message.messageId} 
            className={`message ${message.userId === currentUser.id ? 'own' : ''} ${message.userId === 'system' ? 'system' : ''}`}
          >
            <div className="message-header">
              <span className="username">{message.username}</span>
              <span className="timestamp">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
        
        {typingUsers.size > 0 && (
          <div className="typing-indicator">
            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="message-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => handleTyping(e.target.value)}
          placeholder="Type your message..."
          className="message-input"
          maxLength={500}
        />
        <button type="submit" disabled={!newMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
```

### App Component

```typescript
// client/App.tsx
import React, { useState } from 'react'
import { Chat } from './components/Chat'

interface User {
  id: string
  username: string
  status: string
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [currentRoom, setCurrentRoom] = useState('global')
  const [customRoom, setCustomRoom] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      })

      const user = await response.json()
      setUser(user)
    } catch (error) {
      console.error('Failed to create user:', error)
    }
  }

  const joinRoom = (roomId: string) => {
    setCurrentRoom(roomId)
  }

  const joinCustomRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customRoom.trim()) return
    
    setCurrentRoom(customRoom.trim())
    setCustomRoom('')
  }

  if (!user) {
    return (
      <div className="login-container">
        <form onSubmit={login} className="login-form">
          <h1>Join Chat</h1>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="username-input"
            required
          />
          <button type="submit">Join</button>
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="user-info">
          <h3>Welcome, {user.username}!</h3>
        </div>

        <div className="room-list">
          <h4>Rooms</h4>
          <button 
            onClick={() => joinRoom('global')}
            className={currentRoom === 'global' ? 'active' : ''}
          >
            Global Chat
          </button>
          
          <button 
            onClick={() => joinRoom('general')}
            className={currentRoom === 'general' ? 'active' : ''}
          >
            General
          </button>
          
          <button 
            onClick={() => joinRoom('random')}
            className={currentRoom === 'random' ? 'active' : ''}
          >
            Random
          </button>

          <form onSubmit={joinCustomRoom} className="custom-room-form">
            <input
              type="text"
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              placeholder="Custom room name"
              className="custom-room-input"
            />
            <button type="submit">Join</button>
          </form>
        </div>
      </div>

      <div className="main-content">
        <Chat roomId={currentRoom} currentUser={user} />
      </div>
    </div>
  )
}

export default App
```

## Styling

```css
/* client/styles.css */
.app {
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sidebar {
  width: 250px;
  background-color: #2c3e50;
  color: white;
  padding: 20px;
}

.user-info h3 {
  margin: 0 0 20px 0;
  color: #ecf0f1;
}

.room-list h4 {
  margin: 0 0 10px 0;
  color: #bdc3c7;
}

.room-list button {
  display: block;
  width: 100%;
  padding: 10px;
  margin-bottom: 5px;
  background: transparent;
  border: 1px solid #34495e;
  color: white;
  cursor: pointer;
  border-radius: 4px;
}

.room-list button:hover {
  background-color: #34495e;
}

.room-list button.active {
  background-color: #3498db;
  border-color: #3498db;
}

.custom-room-form {
  margin-top: 20px;
}

.custom-room-input {
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid #34495e;
  border-radius: 4px;
  background-color: #34495e;
  color: white;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  padding: 20px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h2 {
  margin: 0;
  color: #2c3e50;
}

.online-count {
  color: #27ae60;
  font-size: 14px;
}

.messages-container {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: white;
}

.message {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 8px;
  max-width: 70%;
}

.message.own {
  margin-left: auto;
  background-color: #3498db;
  color: white;
}

.message:not(.own) {
  background-color: #f8f9fa;
}

.message.system {
  background-color: #f39c12;
  color: white;
  text-align: center;
  max-width: 100%;
  font-style: italic;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
}

.username {
  font-weight: bold;
}

.timestamp {
  opacity: 0.7;
}

.message-content {
  word-wrap: break-word;
}

.typing-indicator {
  font-style: italic;
  color: #7f8c8d;
  margin: 10px 0;
}

.message-form {
  display: flex;
  padding: 20px;
  background-color: #f8f9fa;
  border-top: 1px solid #dee2e6;
}

.message-input {
  flex: 1;
  padding: 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  margin-right: 10px;
  font-size: 14px;
}

.message-form button {
  padding: 10px 20px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.message-form button:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #ecf0f1;
}

.login-form {
  background: white;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  text-align: center;
}

.login-form h1 {
  margin: 0 0 20px 0;
  color: #2c3e50;
}

.username-input {
  width: 250px;
  padding: 10px;
  margin-bottom: 20px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 16px;
}

.login-form button {
  width: 100%;
  padding: 10px;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}
```

## Key Features Demonstrated

1. **Type Safety**: All events are fully typed from server to client
2. **Real-time Communication**: Messages, typing indicators, and user presence
3. **Dynamic Channels**: Support for both global and room-specific channels
4. **Error Handling**: Graceful handling of validation and connection errors
5. **React Integration**: Clean integration with React hooks and components
6. **Multiple Room Support**: Users can join different chat rooms
7. **User Presence**: Track when users join and leave
8. **Typing Indicators**: Real-time typing status updates

## Running the Example

1. **Install dependencies**:
   ```bash
   npm install @matfire/concorde pusher pusher-js arktype express uuid
   ```

2. **Set up environment variables**:
   ```env
   PUSHER_APP_ID=your-app-id
   PUSHER_KEY=your-key
   PUSHER_SECRET=your-secret
   PUSHER_CLUSTER=your-cluster
   
   REACT_APP_PUSHER_KEY=your-key
   REACT_APP_PUSHER_CLUSTER=your-cluster
   ```

3. **Start the server**:
   ```bash
   node server/chat-server.js
   ```

4. **Start the React app**:
   ```bash
   npm start
   ```

## Next Steps

- Add message persistence with a database
- Implement user authentication
- Add file upload support
- Create private messaging between users
- Add message reactions and replies
- Implement chat moderation features

This example shows how Concorde enables building complex real-time applications with full type safety and excellent developer experience.