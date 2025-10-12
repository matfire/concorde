# User Presence Example

This example demonstrates implementing real-time user presence tracking, showing who's online, their status, and activity indicators.

## Registry Definition

```typescript
// shared/presence-registry.ts
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const presenceRegistry = new RegistryBuilder()
  // Global presence channel for online users
  .channel('presence-global', {
    'user-online': type({
      userId: 'string',
      username: 'string',
      status: "'available' | 'busy' | 'away'",
      avatar: 'string',
      timestamp: 'number'
    }),
    'user-offline': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    'status-changed': type({
      userId: 'string',
      username: 'string',
      oldStatus: "'available' | 'busy' | 'away'",
      newStatus: "'available' | 'busy' | 'away'",
      timestamp: 'number'
    }),
    'activity-update': type({
      userId: 'string',
      activity: "'typing' | 'viewing' | 'idle' | 'active'",
      context: 'string', // page, chat room, document, etc.
      timestamp: 'number'
    })
  })
  // Room/page specific presence
  .channel('presence-{context}', {
    'user-joined': type({
      userId: 'string',
      username: 'string',
      status: "'available' | 'busy' | 'away'",
      avatar: 'string',
      timestamp: 'number'
    }),
    'user-left': type({
      userId: 'string',
      username: 'string',
      timestamp: 'number'
    }),
    'cursor-moved': type({
      userId: 'string',
      x: 'number',
      y: 'number',
      timestamp: 'number'
    }),
    'selection-changed': type({
      userId: 'string',
      elementId: 'string',
      'startOffset?': 'number | undefined',
      'endOffset?': 'number | undefined',
      timestamp: 'number'
    }),
    'typing-indicator': type({
      userId: 'string',
      isTyping: 'boolean',
      'location?': 'string | undefined', // specific input field
      timestamp: 'number'
    })
  })
  // Friend presence updates
  .channel('friends-{userId}', {
    'friend-status-update': type({
      friendId: 'string',
      friendName: 'string',
      status: "'available' | 'busy' | 'away' | 'offline'",
      lastSeen: 'number',
      activity: 'string' // what they're currently doing
    }),
    'friend-location-update': type({
      friendId: 'string',
      location: 'string', // page or app section
      timestamp: 'number'
    })
  })
  // Team/workspace presence
  .channel('team-presence-{teamId}', {
    'member-online': type({
      userId: 'string',
      username: 'string',
      role: "'admin' | 'member' | 'viewer'",
      status: "'available' | 'busy' | 'away'",
      timestamp: 'number'
    }),
    'member-offline': type({
      userId: 'string',
      username: 'string',
      lastActivity: 'number',
      timestamp: 'number'
    }),
    'collaborative-activity': type({
      userId: 'string',
      action: "'editing' | 'commenting' | 'reviewing'",
      target: 'string', // document, task, etc.
      timestamp: 'number'
    })
  })
  .build()

export type PresenceRegistry = typeof presenceRegistry
```

## Server Implementation

### Presence Service

```typescript
// server/presence-service.ts
import Pusher from 'pusher'
import { createServer } from '@matfire/concorde/server'
import { presenceRegistry } from '../shared/presence-registry'

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
})

const server = createServer(presenceRegistry, pusher)

interface UserPresence {
  userId: string
  username: string
  status: 'available' | 'busy' | 'away'
  avatar: string
  lastActivity: number
  contexts: Set<string> // pages/rooms user is present in
  friends: Set<string>
  teams: Set<string>
}

interface ContextPresence {
  context: string
  users: Map<string, {
    userId: string
    username: string
    status: string
    avatar: string
    joinedAt: number
  }>
}

// In-memory storage (use Redis in production)
const onlineUsers = new Map<string, UserPresence>()
const contextPresence = new Map<string, ContextPresence>()

export class PresenceService {
  async setUserOnline(
    userId: string,
    username: string,
    avatar: string,
    status: 'available' | 'busy' | 'away' = 'available'
  ) {
    const timestamp = Date.now()
    
    const existingUser = onlineUsers.get(userId)
    const wasOnline = !!existingUser

    // Update user presence
    const userPresence: UserPresence = {
      userId,
      username,
      status,
      avatar,
      lastActivity: timestamp,
      contexts: existingUser?.contexts || new Set(),
      friends: existingUser?.friends || new Set(),
      teams: existingUser?.teams || new Set()
    }

    onlineUsers.set(userId, userPresence)

    if (!wasOnline) {
      // Broadcast to global presence
      await server.trigger('presence-global', 'user-online', {
        userId,
        username,
        status,
        avatar,
        timestamp
      })

      // Notify friends
      await this.notifyFriends(userId, 'online', userPresence)

      // Notify teams
      await this.notifyTeams(userId, 'online', userPresence)
    }

    return userPresence
  }

  async setUserOffline(userId: string) {
    const user = onlineUsers.get(userId)
    if (!user) return

    const timestamp = Date.now()

    // Remove from all contexts
    for (const context of user.contexts) {
      await this.leaveContext(userId, context)
    }

    // Broadcast offline status
    await server.trigger('presence-global', 'user-offline', {
      userId: user.userId,
      username: user.username,
      timestamp
    })

    // Notify friends
    await this.notifyFriends(userId, 'offline', user)

    // Notify teams
    await this.notifyTeams(userId, 'offline', user)

    onlineUsers.delete(userId)
  }

  async updateStatus(
    userId: string,
    newStatus: 'available' | 'busy' | 'away'
  ) {
    const user = onlineUsers.get(userId)
    if (!user) return

    const oldStatus = user.status
    user.status = newStatus
    user.lastActivity = Date.now()

    // Broadcast status change
    await server.trigger('presence-global', 'status-changed', {
      userId,
      username: user.username,
      oldStatus,
      newStatus,
      timestamp: Date.now()
    })

    // Update in all contexts
    for (const context of user.contexts) {
      const contextData = contextPresence.get(context)
      if (contextData?.users.has(userId)) {
        contextData.users.get(userId)!.status = newStatus
      }
    }

    // Notify friends
    await this.notifyFriends(userId, 'status-change', user)
  }

  async joinContext(userId: string, context: string) {
    const user = onlineUsers.get(userId)
    if (!user) return

    user.contexts.add(context)
    user.lastActivity = Date.now()

    // Initialize context if it doesn't exist
    if (!contextPresence.has(context)) {
      contextPresence.set(context, {
        context,
        users: new Map()
      })
    }

    const contextData = contextPresence.get(context)!
    contextData.users.set(userId, {
      userId,
      username: user.username,
      status: user.status,
      avatar: user.avatar,
      joinedAt: Date.now()
    })

    // Broadcast join event
    await server.trigger(
      { template: 'presence-{context}', params: { context } },
      'user-joined',
      {
        userId,
        username: user.username,
        status: user.status,
        avatar: user.avatar,
        timestamp: Date.now()
      }
    )

    return this.getContextPresence(context)
  }

  async leaveContext(userId: string, context: string) {
    const user = onlineUsers.get(userId)
    if (!user) return

    user.contexts.delete(context)

    const contextData = contextPresence.get(context)
    if (contextData?.users.has(userId)) {
      contextData.users.delete(userId)

      // Broadcast leave event
      await server.trigger(
        { template: 'presence-{context}', params: { context } },
        'user-left',
        {
          userId,
          username: user.username,
          timestamp: Date.now()
        }
      )
    }

    // Clean up empty contexts
    if (contextData?.users.size === 0) {
      contextPresence.delete(context)
    }
  }

  async updateActivity(
    userId: string,
    activity: 'typing' | 'viewing' | 'idle' | 'active',
    context: string
  ) {
    const user = onlineUsers.get(userId)
    if (!user) return

    user.lastActivity = Date.now()

    await server.trigger('presence-global', 'activity-update', {
      userId,
      activity,
      context,
      timestamp: Date.now()
    })
  }

  async updateCursor(userId: string, context: string, x: number, y: number) {
    const user = onlineUsers.get(userId)
    if (!user || !user.contexts.has(context)) return

    await server.trigger(
      { template: 'presence-{context}', params: { context } },
      'cursor-moved',
      {
        userId,
        x,
        y,
        timestamp: Date.now()
      }
    )
  }

  async updateTypingIndicator(
    userId: string,
    context: string,
    isTyping: boolean,
    location?: string
  ) {
    const user = onlineUsers.get(userId)
    if (!user || !user.contexts.has(context)) return

    await server.trigger(
      { template: 'presence-{context}', params: { context } },
      'typing-indicator',
      {
        userId,
        isTyping,
        location,
        timestamp: Date.now()
      }
    )
  }

  async updateSelection(
    userId: string,
    context: string,
    elementId: string,
    startOffset?: number,
    endOffset?: number
  ) {
    const user = onlineUsers.get(userId)
    if (!user || !user.contexts.has(context)) return

    await server.trigger(
      { template: 'presence-{context}', params: { context } },
      'selection-changed',
      {
        userId,
        elementId,
        startOffset,
        endOffset,
        timestamp: Date.now()
      }
    )
  }

  getOnlineUsers(): UserPresence[] {
    return Array.from(onlineUsers.values())
  }

  getContextPresence(context: string) {
    const contextData = contextPresence.get(context)
    return contextData ? Array.from(contextData.users.values()) : []
  }

  getUserPresence(userId: string): UserPresence | undefined {
    return onlineUsers.get(userId)
  }

  private async notifyFriends(
    userId: string,
    event: 'online' | 'offline' | 'status-change',
    user: UserPresence
  ) {
    for (const friendId of user.friends) {
      let eventData: any

      switch (event) {
        case 'online':
        case 'status-change':
          eventData = {
            friendId: userId,
            friendName: user.username,
            status: user.status,
            lastSeen: user.lastActivity,
            activity: this.getCurrentActivity(user)
          }
          break
        case 'offline':
          eventData = {
            friendId: userId,
            friendName: user.username,
            status: 'offline',
            lastSeen: user.lastActivity,
            activity: 'Offline'
          }
          break
      }

      await server.trigger(
        { template: 'friends-{userId}', params: { userId: friendId } },
        'friend-status-update',
        eventData
      )
    }
  }

  private async notifyTeams(
    userId: string,
    event: 'online' | 'offline',
    user: UserPresence
  ) {
    for (const teamId of user.teams) {
      const eventName = event === 'online' ? 'member-online' : 'member-offline'
      const eventData = event === 'online' 
        ? {
            userId,
            username: user.username,
            role: 'member' as const, // Get actual role from team data
            status: user.status,
            timestamp: Date.now()
          }
        : {
            userId,
            username: user.username,
            lastActivity: user.lastActivity,
            timestamp: Date.now()
          }

      await server.trigger(
        { template: 'team-presence-{teamId}', params: { teamId } },
        eventName,
        eventData
      )
    }
  }

  private getCurrentActivity(user: UserPresence): string {
    if (user.contexts.size === 0) return 'Online'
    
    const contexts = Array.from(user.contexts)
    if (contexts.length === 1) {
      return `Viewing ${contexts[0]}`
    }
    
    return `Active in ${contexts.length} places`
  }

  // Cleanup inactive users (run periodically)
  async cleanupInactiveUsers() {
    const now = Date.now()
    const TIMEOUT = 5 * 60 * 1000 // 5 minutes

    for (const [userId, user] of onlineUsers.entries()) {
      if (now - user.lastActivity > TIMEOUT) {
        await this.setUserOffline(userId)
      }
    }
  }
}

export const presenceService = new PresenceService()

// Run cleanup every minute
setInterval(() => {
  presenceService.cleanupInactiveUsers()
}, 60000)
```

### Express Routes

```typescript
// server/presence-routes.ts
import express from 'express'
import { presenceService } from './presence-service'

const router = express.Router()

// Set user online
router.post('/api/presence/online', async (req, res) => {
  try {
    const { userId, username, avatar, status } = req.body
    
    const presence = await presenceService.setUserOnline(userId, username, avatar, status)
    
    res.json({ success: true, presence })
  } catch (error) {
    console.error('Error setting user online:', error)
    res.status(500).json({ error: 'Failed to set user online' })
  }
})

// Set user offline
router.post('/api/presence/offline', async (req, res) => {
  try {
    const { userId } = req.body
    
    await presenceService.setUserOffline(userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error setting user offline:', error)
    res.status(500).json({ error: 'Failed to set user offline' })
  }
})

// Update status
router.put('/api/presence/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params
    const { status } = req.body
    
    await presenceService.updateStatus(userId, status)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error updating status:', error)
    res.status(500).json({ error: 'Failed to update status' })
  }
})

// Join context
router.post('/api/presence/:userId/contexts/:context', async (req, res) => {
  try {
    const { userId, context } = req.params
    
    const presence = await presenceService.joinContext(userId, context)
    
    res.json({ success: true, presence })
  } catch (error) {
    console.error('Error joining context:', error)
    res.status(500).json({ error: 'Failed to join context' })
  }
})

// Leave context
router.delete('/api/presence/:userId/contexts/:context', async (req, res) => {
  try {
    const { userId, context } = req.params
    
    await presenceService.leaveContext(userId, context)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error leaving context:', error)
    res.status(500).json({ error: 'Failed to leave context' })
  }
})

// Update cursor position
router.post('/api/presence/:userId/cursor', async (req, res) => {
  try {
    const { userId } = req.params
    const { context, x, y } = req.body
    
    await presenceService.updateCursor(userId, context, x, y)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error updating cursor:', error)
    res.status(500).json({ error: 'Failed to update cursor' })
  }
})

// Get online users
router.get('/api/presence/online', (req, res) => {
  try {
    const users = presenceService.getOnlineUsers()
    res.json(users)
  } catch (error) {
    console.error('Error getting online users:', error)
    res.status(500).json({ error: 'Failed to get online users' })
  }
})

// Get context presence
router.get('/api/presence/contexts/:context', (req, res) => {
  try {
    const { context } = req.params
    const presence = presenceService.getContextPresence(context)
    res.json(presence)
  } catch (error) {
    console.error('Error getting context presence:', error)
    res.status(500).json({ error: 'Failed to get context presence' })
  }
})

export default router
```

## React Client Implementation

### Presence Provider

```typescript
// client/contexts/PresenceContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { presenceRegistry } from '../../shared/presence-registry'

const pusher = new Pusher(process.env.REACT_APP_PUSHER_KEY!, {
  cluster: process.env.REACT_APP_PUSHER_CLUSTER!
})

const client = createClient(presenceRegistry, pusher)

interface User {
  userId: string
  username: string
  status: 'available' | 'busy' | 'away'
  avatar: string
  timestamp: number
}

interface CursorPosition {
  userId: string
  x: number
  y: number
  timestamp: number
}

interface PresenceContextType {
  onlineUsers: User[]
  contextUsers: User[]
  cursorPositions: Map<string, CursorPosition>
  currentContext: string | null
  joinContext: (context: string) => Promise<void>
  leaveContext: () => Promise<void>
  updateStatus: (status: 'available' | 'busy' | 'away') => Promise<void>
  updateCursor: (x: number, y: number) => void
  setTyping: (isTyping: boolean, location?: string) => void
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined)

export function PresenceProvider({ 
  children, 
  currentUser 
}: { 
  children: React.ReactNode
  currentUser: { id: string, username: string, avatar: string }
}) {
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [contextUsers, setContextUsers] = useState<User[]>([])
  const [cursorPositions, setCursorPositions] = useState(new Map<string, CursorPosition>())
  const [currentContext, setCurrentContext] = useState<string | null>(null)
  const [userStatus, setUserStatus] = useState<'available' | 'busy' | 'away'>('available')
  
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const heartbeatRef = useRef<NodeJS.Timeout>()

  // Set user online on mount
  useEffect(() => {
    const setOnline = async () => {
      try {
        await fetch('/api/presence/online', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            status: userStatus
          })
        })
      } catch (error) {
        console.error('Failed to set user online:', error)
      }
    }

    setOnline()

    // Set up heartbeat to keep user online
    heartbeatRef.current = setInterval(() => {
      fetch('/api/presence/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar,
          status: userStatus
        })
      }).catch(console.error)
    }, 30000) // Every 30 seconds

    // Set user offline on page unload
    const handleUnload = () => {
      navigator.sendBeacon('/api/presence/offline', JSON.stringify({
        userId: currentUser.id
      }))
    }

    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(heartbeatRef.current!)
      window.removeEventListener('beforeunload', handleUnload)
      
      // Set offline when component unmounts
      fetch('/api/presence/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      }).catch(console.error)
    }
  }, [currentUser, userStatus])

  // Subscribe to global presence
  useEffect(() => {
    const globalChannel = client.subscribe('presence-global')

    globalChannel.bind('user-online', (data) => {
      setOnlineUsers(prev => {
        const filtered = prev.filter(u => u.userId !== data.userId)
        return [...filtered, {
          userId: data.userId,
          username: data.username,
          status: data.status,
          avatar: data.avatar,
          timestamp: data.timestamp
        }]
      })
    })

    globalChannel.bind('user-offline', (data) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== data.userId))
    })

    globalChannel.bind('status-changed', (data) => {
      setOnlineUsers(prev => prev.map(u => 
        u.userId === data.userId 
          ? { ...u, status: data.newStatus, timestamp: data.timestamp }
          : u
      ))
    })

    return () => {
      globalChannel.unbind('user-online')
      globalChannel.unbind('user-offline')
      globalChannel.unbind('status-changed')
    }
  }, [])

  // Subscribe to context presence
  useEffect(() => {
    if (!currentContext) return

    const contextChannel = client.subscribe({
      template: 'presence-{context}',
      params: { context: currentContext }
    })

    contextChannel.bind('user-joined', (data) => {
      setContextUsers(prev => {
        const filtered = prev.filter(u => u.userId !== data.userId)
        return [...filtered, {
          userId: data.userId,
          username: data.username,
          status: data.status,
          avatar: data.avatar,
          timestamp: data.timestamp
        }]
      })
    })

    contextChannel.bind('user-left', (data) => {
      setContextUsers(prev => prev.filter(u => u.userId !== data.userId))
      setCursorPositions(prev => {
        const updated = new Map(prev)
        updated.delete(data.userId)
        return updated
      })
    })

    contextChannel.bind('cursor-moved', (data) => {
      if (data.userId === currentUser.id) return // Ignore own cursor
      
      setCursorPositions(prev => {
        const updated = new Map(prev)
        updated.set(data.userId, {
          userId: data.userId,
          x: data.x,
          y: data.y,
          timestamp: data.timestamp
        })
        return updated
      })

      // Remove cursor after inactivity
      setTimeout(() => {
        setCursorPositions(prev => {
          const updated = new Map(prev)
          const cursor = updated.get(data.userId)
          if (cursor && cursor.timestamp === data.timestamp) {
            updated.delete(data.userId)
          }
          return updated
        })
      }, 3000)
    })

    return () => {
      contextChannel.unbind('user-joined')
      contextChannel.unbind('user-left')
      contextChannel.unbind('cursor-moved')
    }
  }, [currentContext, currentUser.id])

  const joinContext = async (context: string) => {
    try {
      if (currentContext) {
        await leaveContext()
      }

      await fetch(`/api/presence/${currentUser.id}/contexts/${context}`, {
        method: 'POST'
      })

      setCurrentContext(context)
      
      // Load existing context users
      const response = await fetch(`/api/presence/contexts/${context}`)
      const users = await response.json()
      setContextUsers(users)

    } catch (error) {
      console.error('Failed to join context:', error)
    }
  }

  const leaveContext = async () => {
    if (!currentContext) return

    try {
      await fetch(`/api/presence/${currentUser.id}/contexts/${currentContext}`, {
        method: 'DELETE'
      })

      setCurrentContext(null)
      setContextUsers([])
      setCursorPositions(new Map())
    } catch (error) {
      console.error('Failed to leave context:', error)
    }
  }

  const updateStatus = async (status: 'available' | 'busy' | 'away') => {
    try {
      await fetch(`/api/presence/${currentUser.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      setUserStatus(status)
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const updateCursor = (x: number, y: number) => {
    if (!currentContext) return

    fetch('/api/presence/${currentUser.id}/cursor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: currentContext, x, y })
    }).catch(console.error)
  }

  const setTyping = (isTyping: boolean, location?: string) => {
    if (!currentContext) return

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Send typing indicator
    fetch('/api/presence/${currentUser.id}/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        context: currentContext, 
        isTyping, 
        location 
      })
    }).catch(console.error)

    // Auto-stop typing after delay
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false, location)
      }, 3000)
    }
  }

  return (
    <PresenceContext.Provider value={{
      onlineUsers,
      contextUsers,
      cursorPositions,
      currentContext,
      joinContext,
      leaveContext,
      updateStatus,
      updateCursor,
      setTyping
    }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const context = useContext(PresenceContext)
  if (!context) {
    throw new Error('usePresence must be used within PresenceProvider')
  }
  return context
}
```

### Online Users Component

```typescript
// client/components/OnlineUsers.tsx
import React from 'react'
import { usePresence } from '../contexts/PresenceContext'

export function OnlineUsers() {
  const { onlineUsers } = usePresence()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#2ecc71'
      case 'busy': return '#e74c3c'
      case 'away': return '#f39c12'
      default: return '#95a5a6'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'Available'
      case 'busy': return 'Busy'
      case 'away': return 'Away'
      default: return 'Unknown'
    }
  }

  return (
    <div className="online-users">
      <h3>Online Users ({onlineUsers.length})</h3>
      <div className="users-list">
        {onlineUsers.map((user) => (
          <div key={user.userId} className="user-item">
            <div className="user-avatar">
              <img src={user.avatar} alt={user.username} />
              <div 
                className="status-indicator"
                style={{ backgroundColor: getStatusColor(user.status) }}
                title={getStatusText(user.status)}
              />
            </div>
            <div className="user-info">
              <div className="username">{user.username}</div>
              <div className="status">{getStatusText(user.status)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Context Presence Component

```typescript
// client/components/ContextPresence.tsx
import React from 'react'
import { usePresence } from '../contexts/PresenceContext'

export function ContextPresence() {
  const { contextUsers, currentContext } = usePresence()

  if (!currentContext || contextUsers.length === 0) return null

  return (
    <div className="context-presence">
      <div className="presence-header">
        <span className="viewing-indicator">👁️</span>
        <span className="viewer-count">
          {contextUsers.length} viewing {currentContext}
        </span>
      </div>
      
      <div className="viewer-avatars">
        {contextUsers.slice(0, 5).map((user) => (
          <div key={user.userId} className="viewer-avatar" title={user.username}>
            <img src={user.avatar} alt={user.username} />
          </div>
        ))}
        
        {contextUsers.length > 5 && (
          <div className="more-viewers">
            +{contextUsers.length - 5}
          </div>
        )}
      </div>
    </div>
  )
}
```

### Cursor Tracking Component

```typescript
// client/components/CursorTracking.tsx
import React, { useEffect } from 'react'
import { usePresence } from '../contexts/PresenceContext'

export function CursorTracking() {
  const { cursorPositions, contextUsers, updateCursor } = usePresence()

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      updateCursor(e.clientX, e.clientY)
    }

    // Throttle cursor updates
    let throttleTimeout: NodeJS.Timeout
    const throttledMouseMove = (e: MouseEvent) => {
      if (throttleTimeout) return
      
      throttleTimeout = setTimeout(() => {
        handleMouseMove(e)
        clearTimeout(throttleTimeout)
      }, 50) // Update every 50ms
    }

    window.addEventListener('mousemove', throttledMouseMove)

    return () => {
      window.removeEventListener('mousemove', throttledMouseMove)
      if (throttleTimeout) clearTimeout(throttleTimeout)
    }
  }, [updateCursor])

  return (
    <div className="cursor-overlay">
      {Array.from(cursorPositions.entries()).map(([userId, position]) => {
        const user = contextUsers.find(u => u.userId === userId)
        if (!user) return null

        return (
          <div
            key={userId}
            className="remote-cursor"
            style={{
              left: position.x,
              top: position.y,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="cursor-pointer">↖</div>
            <div className="cursor-label">{user.username}</div>
          </div>
        )
      })}
    </div>
  )
}
```

### Status Selector Component

```typescript
// client/components/StatusSelector.tsx
import React, { useState } from 'react'
import { usePresence } from '../contexts/PresenceContext'

export function StatusSelector() {
  const { updateStatus } = usePresence()
  const [currentStatus, setCurrentStatus] = useState<'available' | 'busy' | 'away'>('available')
  const [isOpen, setIsOpen] = useState(false)

  const statuses = [
    { value: 'available', label: 'Available', color: '#2ecc71', emoji: '🟢' },
    { value: 'busy', label: 'Busy', color: '#e74c3c', emoji: '🔴' },
    { value: 'away', label: 'Away', color: '#f39c12', emoji: '🟡' }
  ] as const

  const handleStatusChange = async (status: 'available' | 'busy' | 'away') => {
    await updateStatus(status)
    setCurrentStatus(status)
    setIsOpen(false)
  }

  const currentStatusInfo = statuses.find(s => s.value === currentStatus)

  return (
    <div className="status-selector">
      <button 
        className="status-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="status-emoji">{currentStatusInfo?.emoji}</span>
        <span className="status-label">{currentStatusInfo?.label}</span>
        <span className="status-arrow">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="status-dropdown">
            {statuses.map((status) => (
              <button
                key={status.value}
                className={`status-option ${currentStatus === status.value ? 'active' : ''}`}
                onClick={() => handleStatusChange(status.value)}
              >
                <span className="status-emoji">{status.emoji}</span>
                <span className="status-label">{status.label}</span>
              </button>
            ))}
          </div>
          <div 
            className="status-overlay"
            onClick={() => setIsOpen(false)}
          />
        </>
      )}
    </div>
  )
}
```

## Styling

```css
/* client/presence-styles.css */
.online-users {
  width: 250px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.online-users h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.users-list {
  max-height: 400px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.user-item:last-child {
  border-bottom: none;
}

.user-avatar {
  position: relative;
  margin-right: 12px;
}

.user-avatar img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid white;
}

.user-info {
  flex: 1;
}

.username {
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.status {
  font-size: 12px;
  color: #666;
}

/* Context Presence */
.context-presence {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #f8f9fa;
  border-radius: 20px;
  margin: 10px 0;
}

.presence-header {
  display: flex;
  align-items: center;
  margin-right: 12px;
}

.viewing-indicator {
  margin-right: 6px;
}

.viewer-count {
  font-size: 12px;
  color: #666;
}

.viewer-avatars {
  display: flex;
  align-items: center;
}

.viewer-avatar {
  width: 24px;
  height: 24px;
  margin-left: -6px;
  border: 2px solid white;
  border-radius: 50%;
  overflow: hidden;
}

.viewer-avatar:first-child {
  margin-left: 0;
}

.viewer-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-viewers {
  margin-left: 4px;
  font-size: 12px;
  color: #666;
}

/* Cursor Tracking */
.cursor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 1000;
}

.remote-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 1001;
}

.cursor-pointer {
  font-size: 16px;
  color: #3498db;
  text-shadow: 1px 1px 1px rgba(0,0,0,0.3);
}

.cursor-label {
  position: absolute;
  top: 20px;
  left: 10px;
  background: #3498db;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
}

/* Status Selector */
.status-selector {
  position: relative;
}

.status-button {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
}

.status-button:hover {
  background: #f8f9fa;
}

.status-emoji {
  margin-right: 6px;
}

.status-label {
  margin-right: 8px;
}

.status-arrow {
  font-size: 10px;
  color: #666;
}

.status-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1001;
  margin-top: 4px;
}

.status-option {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
}

.status-option:hover {
  background: #f8f9fa;
}

.status-option.active {
  background: #e3f2fd;
}

.status-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}
```

## Key Features Demonstrated

1. **Real-time Presence**: Track users going online/offline
2. **Status Management**: Available, busy, away states
3. **Context Awareness**: Track presence in specific pages/rooms
4. **Cursor Tracking**: Real-time cursor positions
5. **Activity Indicators**: Typing, viewing, editing states
6. **Friend/Team Presence**: Contextual presence updates
7. **Automatic Cleanup**: Handle disconnections and timeouts
8. **Type Safety**: Full TypeScript support

This example shows how to build sophisticated presence features that enhance collaboration and user awareness in real-time applications.