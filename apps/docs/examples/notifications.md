# Live Notifications Example

This example demonstrates building a comprehensive notification system with multiple types of notifications, user preferences, and real-time delivery.

## Registry Definition

```typescript
// shared/notifications-registry.ts
import { type } from 'arktype'
import { RegistryBuilder } from '@matfire/concorde'

export const notificationRegistry = new RegistryBuilder()
  // Global system notifications
  .channel('system-notifications', {
    'maintenance-alert': type({
      id: 'string',
      title: 'string',
      message: 'string',
      scheduledTime: 'number',
      duration: 'number', // in minutes
      severity: "'low' | 'medium' | 'high'",
      affectedServices: 'string[]'
    }),
    'service-status': type({
      service: 'string',
      status: "'operational' | 'degraded' | 'outage'",
      message: 'string',
      timestamp: 'number'
    }),
    'security-alert': type({
      id: 'string',
      type: "'login-attempt' | 'password-change' | 'suspicious-activity'",
      message: 'string',
      severity: "'info' | 'warning' | 'critical'",
      timestamp: 'number'
    })
  })
  // User-specific notifications
  .channel('notifications-{userId}', {
    'personal-alert': type({
      id: 'string',
      type: "'info' | 'success' | 'warning' | 'error'",
      title: 'string',
      message: 'string',
      timestamp: 'number',
      'actionUrl?': 'string | undefined',
      'actionText?': 'string | undefined'
    }),
    'friend-request': type({
      id: 'string',
      fromUserId: 'string',
      fromUsername: 'string',
      fromAvatar: 'string',
      timestamp: 'number'
    }),
    'message-received': type({
      id: 'string',
      fromUserId: 'string',
      fromUsername: 'string',
      preview: 'string',
      chatId: 'string',
      timestamp: 'number'
    }),
    'activity-update': type({
      id: 'string',
      type: "'like' | 'comment' | 'share' | 'mention'",
      actorId: 'string',
      actorName: 'string',
      contentId: 'string',
      contentType: "'post' | 'photo' | 'video'",
      preview: 'string',
      timestamp: 'number'
    })
  })
  // Team/organization notifications
  .channel('team-{teamId}', {
    'member-joined': type({
      userId: 'string',
      username: 'string',
      role: "'admin' | 'member' | 'viewer'",
      addedBy: 'string',
      timestamp: 'number'
    }),
    'project-update': type({
      projectId: 'string',
      projectName: 'string',
      updateType: "'created' | 'completed' | 'deadline-approaching'",
      message: 'string',
      updatedBy: 'string',
      timestamp: 'number'
    }),
    'task-assigned': type({
      taskId: 'string',
      taskTitle: 'string',
      assignedTo: 'string',
      assignedBy: 'string',
      dueDate: 'number',
      priority: "'low' | 'medium' | 'high' | 'urgent'",
      timestamp: 'number'
    })
  })
  // Notification settings and preferences
  .channel('user-preferences-{userId}', {
    'settings-updated': type({
      settings: {
        'email': 'boolean',
        'push': 'boolean',
        'desktop': 'boolean',
        'quiet-hours': {
          enabled: 'boolean',
          start: 'string', // HH:MM format
          end: 'string'
        },
        'categories': {
          'social': 'boolean',
          'security': 'boolean',
          'system': 'boolean',
          'team': 'boolean'
        }
      },
      updatedBy: 'string',
      timestamp: 'number'
    })
  })
  .build()

export type NotificationRegistry = typeof notificationRegistry
```

## Server Implementation

### Notification Service

```typescript
// server/notification-service.ts
import Pusher from 'pusher'
import { createServer } from '@matfire/concorde/server'
import { notificationRegistry } from '../shared/notifications-registry'
import { v4 as uuidv4 } from 'uuid'

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
})

const server = createServer(notificationRegistry, pusher)

interface User {
  id: string
  username: string
  email: string
  preferences: NotificationPreferences
}

interface NotificationPreferences {
  email: boolean
  push: boolean
  desktop: boolean
  quietHours: {
    enabled: boolean
    start: string
    end: string
  }
  categories: {
    social: boolean
    security: boolean
    system: boolean
    team: boolean
  }
}

// In-memory storage (use database in production)
const users = new Map<string, User>()
const notifications = new Map<string, any[]>() // userId -> notifications

export class NotificationService {
  async sendPersonalNotification(
    userId: string,
    notification: {
      type: 'info' | 'success' | 'warning' | 'error'
      title: string
      message: string
      actionUrl?: string
      actionText?: string
    }
  ) {
    const user = users.get(userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Check if user allows this type of notification
    if (!this.shouldSendNotification(user, 'social')) {
      return false
    }

    const notificationData = {
      id: uuidv4(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      timestamp: Date.now(),
      actionUrl: notification.actionUrl,
      actionText: notification.actionText
    }

    // Store notification
    if (!notifications.has(userId)) {
      notifications.set(userId, [])
    }
    notifications.get(userId)!.push(notificationData)

    // Send real-time notification
    await server.trigger(
      { template: 'notifications-{userId}', params: { userId } },
      'personal-alert',
      notificationData
    )

    // Send additional notifications based on user preferences
    if (user.preferences.email) {
      await this.sendEmailNotification(user.email, notificationData)
    }

    if (user.preferences.push) {
      await this.sendPushNotification(userId, notificationData)
    }

    return true
  }

  async sendFriendRequest(
    toUserId: string,
    fromUserId: string,
    fromUsername: string,
    fromAvatar: string
  ) {
    const user = users.get(toUserId)
    if (!user || !this.shouldSendNotification(user, 'social')) {
      return false
    }

    const notificationData = {
      id: uuidv4(),
      fromUserId,
      fromUsername,
      fromAvatar,
      timestamp: Date.now()
    }

    await server.trigger(
      { template: 'notifications-{userId}', params: { userId: toUserId } },
      'friend-request',
      notificationData
    )

    return true
  }

  async sendMessageNotification(
    toUserId: string,
    fromUserId: string,
    fromUsername: string,
    preview: string,
    chatId: string
  ) {
    const user = users.get(toUserId)
    if (!user || !this.shouldSendNotification(user, 'social')) {
      return false
    }

    const notificationData = {
      id: uuidv4(),
      fromUserId,
      fromUsername,
      preview,
      chatId,
      timestamp: Date.now()
    }

    await server.trigger(
      { template: 'notifications-{userId}', params: { userId: toUserId } },
      'message-received',
      notificationData
    )

    return true
  }

  async sendTeamNotification(
    teamId: string,
    notification: {
      type: 'member-joined' | 'project-update' | 'task-assigned'
      data: any
    }
  ) {
    // Get team members and check their preferences
    const teamMembers = await this.getTeamMembers(teamId)
    
    for (const memberId of teamMembers) {
      const user = users.get(memberId)
      if (user && this.shouldSendNotification(user, 'team')) {
        await server.trigger(
          { template: 'team-{teamId}', params: { teamId } },
          notification.type as any,
          notification.data
        )
      }
    }
  }

  async broadcastSystemNotification(
    notification: {
      type: 'maintenance-alert' | 'service-status' | 'security-alert'
      data: any
    }
  ) {
    await server.trigger(
      'system-notifications',
      notification.type,
      notification.data
    )
  }

  async updateUserPreferences(userId: string, preferences: NotificationPreferences) {
    const user = users.get(userId)
    if (!user) {
      throw new Error('User not found')
    }

    user.preferences = preferences
    users.set(userId, user)

    // Notify user of preference update
    await server.trigger(
      { template: 'user-preferences-{userId}', params: { userId } },
      'settings-updated',
      {
        settings: preferences,
        updatedBy: userId,
        timestamp: Date.now()
      }
    )
  }

  private shouldSendNotification(user: User, category: keyof NotificationPreferences['categories']): boolean {
    // Check quiet hours
    if (user.preferences.quietHours.enabled && this.isInQuietHours(user.preferences.quietHours)) {
      return false
    }

    // Check category preferences
    return user.preferences.categories[category]
  }

  private isInQuietHours(quietHours: { start: string; end: string }): boolean {
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    
    return currentTime >= quietHours.start && currentTime <= quietHours.end
  }

  private async sendEmailNotification(email: string, notification: any) {
    // Implement email sending logic
    console.log(`Sending email to ${email}:`, notification.title)
  }

  private async sendPushNotification(userId: string, notification: any) {
    // Implement push notification logic
    console.log(`Sending push notification to ${userId}:`, notification.title)
  }

  private async getTeamMembers(teamId: string): Promise<string[]> {
    // Return team member IDs
    return [] // Implement team member lookup
  }
}

export const notificationService = new NotificationService()
```

### Express API Routes

```typescript
// server/notification-routes.ts
import express from 'express'
import { notificationService } from './notification-service'

const router = express.Router()

// Send personal notification
router.post('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    const { type, title, message, actionUrl, actionText } = req.body

    const success = await notificationService.sendPersonalNotification(userId, {
      type,
      title,
      message,
      actionUrl,
      actionText
    })

    res.json({ success })
  } catch (error) {
    console.error('Error sending notification:', error)
    res.status(500).json({ error: 'Failed to send notification' })
  }
})

// Send friend request
router.post('/api/notifications/:userId/friend-request', async (req, res) => {
  try {
    const { userId } = req.params
    const { fromUserId, fromUsername, fromAvatar } = req.body

    const success = await notificationService.sendFriendRequest(
      userId,
      fromUserId,
      fromUsername,
      fromAvatar
    )

    res.json({ success })
  } catch (error) {
    console.error('Error sending friend request:', error)
    res.status(500).json({ error: 'Failed to send friend request' })
  }
})

// System notification
router.post('/api/system/notifications', async (req, res) => {
  try {
    const { type, data } = req.body

    await notificationService.broadcastSystemNotification({ type, data })

    res.json({ success: true })
  } catch (error) {
    console.error('Error sending system notification:', error)
    res.status(500).json({ error: 'Failed to send system notification' })
  }
})

// Update user preferences
router.put('/api/users/:userId/preferences', async (req, res) => {
  try {
    const { userId } = req.params
    const preferences = req.body

    await notificationService.updateUserPreferences(userId, preferences)

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating preferences:', error)
    res.status(500).json({ error: 'Failed to update preferences' })
  }
})

export default router
```

## React Client Implementation

### Notification Provider

```typescript
// client/contexts/NotificationContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import Pusher from 'pusher-js'
import { createClient } from '@matfire/concorde/client'
import { notificationRegistry } from '../../shared/notifications-registry'

const pusher = new Pusher(process.env.REACT_APP_PUSHER_KEY!, {
  cluster: process.env.REACT_APP_PUSHER_CLUSTER!
})

const client = createClient(notificationRegistry, pusher)

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: number
  read?: boolean
  actionUrl?: string
  actionText?: string
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Notification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearNotification: (id: string) => void
  clearAllNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ 
  children, 
  userId 
}: { 
  children: React.ReactNode
  userId: string 
}) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    if (!userId) return

    // Subscribe to user notifications
    const userChannel = client.subscribe({
      template: 'notifications-{userId}',
      params: { userId }
    })

    // Personal alerts
    userChannel.bind('personal-alert', (data) => {
      const notification: Notification = {
        id: data.id,
        type: data.type,
        title: data.title,
        message: data.message,
        timestamp: data.timestamp,
        read: false,
        actionUrl: data.actionUrl,
        actionText: data.actionText
      }
      
      addNotification(notification)
      showDesktopNotification(notification)
    })

    // Friend requests
    userChannel.bind('friend-request', (data) => {
      const notification: Notification = {
        id: data.id,
        type: 'info',
        title: 'Friend Request',
        message: `${data.fromUsername} wants to be your friend`,
        timestamp: data.timestamp,
        read: false,
        actionUrl: `/profile/${data.fromUserId}`,
        actionText: 'View Profile'
      }
      
      addNotification(notification)
      showDesktopNotification(notification)
    })

    // Message notifications
    userChannel.bind('message-received', (data) => {
      const notification: Notification = {
        id: data.id,
        type: 'info',
        title: `Message from ${data.fromUsername}`,
        message: data.preview,
        timestamp: data.timestamp,
        read: false,
        actionUrl: `/chat/${data.chatId}`,
        actionText: 'Open Chat'
      }
      
      addNotification(notification)
      showDesktopNotification(notification)
    })

    // Subscribe to system notifications
    const systemChannel = client.subscribe('system-notifications')

    systemChannel.bind('maintenance-alert', (data) => {
      const notification: Notification = {
        id: data.id,
        type: data.severity === 'high' ? 'error' : 'warning',
        title: data.title,
        message: data.message,
        timestamp: Date.now(),
        read: false
      }
      
      addNotification(notification)
      showDesktopNotification(notification)
    })

    systemChannel.bind('service-status', (data) => {
      const notification: Notification = {
        id: `service-${Date.now()}`,
        type: data.status === 'outage' ? 'error' : 'warning',
        title: `Service Update: ${data.service}`,
        message: data.message,
        timestamp: data.timestamp,
        read: false
      }
      
      addNotification(notification)
    })

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => {
      userChannel.unbind('personal-alert')
      userChannel.unbind('friend-request')
      userChannel.unbind('message-received')
      systemChannel.unbind('maintenance-alert')
      systemChannel.unbind('service-status')
    }
  }, [userId])

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 50)) // Keep last 50
  }

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, read: true }))
    )
  }

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id))
  }

  const clearAllNotifications = () => {
    setNotifications([])
  }

  const showDesktopNotification = (notification: Notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/notification-icon.png',
        tag: notification.id
      })
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotification,
      clearAllNotifications
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}
```

### Notification Bell Component

```typescript
// client/components/NotificationBell.tsx
import React, { useState } from 'react'
import { useNotifications } from '../contexts/NotificationContext'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    clearNotification 
  } = useNotifications()

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return 'ℹ️'
    }
  }

  return (
    <div className="notification-bell">
      <button 
        className={`bell-button ${unreadCount > 0 ? 'has-notifications' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Notifications</h3>
            <div className="notification-actions">
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="mark-all-read">
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div 
                  key={notification.id}
                  className={`notification-item ${!notification.read ? 'unread' : ''}`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="notification-content">
                    <div className="notification-title">
                      {notification.title}
                    </div>
                    <div className="notification-message">
                      {notification.message}
                    </div>
                    <div className="notification-time">
                      {formatTimeAgo(notification.timestamp)}
                    </div>
                    
                    {notification.actionUrl && (
                      <a 
                        href={notification.actionUrl}
                        className="notification-action"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {notification.actionText || 'View'}
                      </a>
                    )}
                  </div>

                  <button 
                    className="notification-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearNotification(notification.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div 
          className="notification-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
```

### Toast Notifications

```typescript
// client/components/ToastNotifications.tsx
import React, { useEffect, useState } from 'react'
import { useNotifications } from '../contexts/NotificationContext'

interface ToastNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  duration?: number
}

export function ToastNotifications() {
  const { notifications } = useNotifications()
  const [toasts, setToasts] = useState<ToastNotification[]>([])

  useEffect(() => {
    // Show toast for new notifications
    const latestNotification = notifications[0]
    if (latestNotification && !latestNotification.read) {
      const toast: ToastNotification = {
        id: latestNotification.id,
        type: latestNotification.type,
        title: latestNotification.title,
        message: latestNotification.message,
        duration: 5000
      }

      setToasts(prev => [toast, ...prev.slice(0, 2)]) // Show max 3 toasts

      // Auto-remove after duration
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, toast.duration)
    }
  }, [notifications])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div 
          key={toast.id}
          className={`toast toast-${toast.type}`}
        >
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button 
            className="toast-close"
            onClick={() => removeToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
```

## Styling

```css
/* client/notification-styles.css */
.notification-bell {
  position: relative;
}

.bell-button {
  position: relative;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.bell-button:hover {
  background-color: #f0f0f0;
}

.bell-button.has-notifications {
  animation: ring 2s ease-in-out infinite;
}

.notification-badge {
  position: absolute;
  top: 0;
  right: 0;
  background-color: #e74c3c;
  color: white;
  border-radius: 50%;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: bold;
  min-width: 18px;
  text-align: center;
}

.notification-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  width: 350px;
  max-height: 500px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  overflow: hidden;
}

.notification-header {
  padding: 15px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notification-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.mark-all-read {
  background: none;
  border: none;
  color: #3498db;
  cursor: pointer;
  font-size: 14px;
}

.notification-list {
  max-height: 400px;
  overflow-y: auto;
}

.no-notifications {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

.notification-item {
  display: flex;
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.notification-item:hover {
  background-color: #f8f9fa;
}

.notification-item.unread {
  background-color: #f0f8ff;
  border-left: 3px solid #3498db;
}

.notification-icon {
  font-size: 20px;
  margin-right: 12px;
  margin-top: 2px;
}

.notification-content {
  flex: 1;
}

.notification-title {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.notification-message {
  color: #666;
  font-size: 14px;
  line-height: 1.4;
  margin-bottom: 8px;
}

.notification-time {
  font-size: 12px;
  color: #999;
}

.notification-action {
  display: inline-block;
  margin-top: 8px;
  color: #3498db;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.notification-action:hover {
  text-decoration: underline;
}

.notification-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  margin-left: 8px;
}

.notification-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

/* Toast Notifications */
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
}

.toast {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  margin-bottom: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 300px;
  max-width: 400px;
  animation: slideIn 0.3s ease-out;
}

.toast-info {
  background-color: #e3f2fd;
  border-left: 4px solid #2196f3;
}

.toast-success {
  background-color: #e8f5e8;
  border-left: 4px solid #4caf50;
}

.toast-warning {
  background-color: #fff3e0;
  border-left: 4px solid #ff9800;
}

.toast-error {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: #333;
}

.toast-message {
  color: #666;
  font-size: 14px;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  margin-left: 12px;
}

@keyframes ring {
  0%, 20%, 40%, 60%, 80%, 100% {
    transform: rotate(0deg);
  }
  10%, 30%, 50%, 70%, 90% {
    transform: rotate(10deg);
  }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

## Usage in Main App

```typescript
// client/App.tsx
import React from 'react'
import { NotificationProvider } from './contexts/NotificationContext'
import { NotificationBell } from './components/NotificationBell'
import { ToastNotifications } from './components/ToastNotifications'

function App() {
  const currentUserId = 'user123' // Get from auth context

  return (
    <NotificationProvider userId={currentUserId}>
      <div className="app">
        <header>
          <h1>My App</h1>
          <NotificationBell />
        </header>
        
        <main>
          {/* Your app content */}
        </main>
        
        <ToastNotifications />
      </div>
    </NotificationProvider>
  )
}

export default App
```

## Key Features

1. **Multiple Notification Types**: Personal, system, team, and friend requests
2. **User Preferences**: Customizable notification settings
3. **Real-time Delivery**: Instant notifications via WebSocket
4. **Multiple Channels**: Desktop, toast, and in-app notifications
5. **Quiet Hours**: Respect user's do-not-disturb settings
6. **Type Safety**: Full TypeScript support throughout
7. **Persistent Storage**: Notification history and preferences
8. **Responsive UI**: Works on desktop and mobile

This example demonstrates how Concorde enables building sophisticated notification systems with full type safety and excellent user experience.