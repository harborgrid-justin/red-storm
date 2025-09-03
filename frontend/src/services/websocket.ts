import { io, Socket } from 'socket.io-client'
import { AuthService } from './auth'

class WebSocketServiceClass {
  private socket: Socket | null = null
  private listeners: Map<string, Set<Function>> = new Map()

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve()
        return
      }

      const token = AuthService.getToken()
      if (!token) {
        reject(new Error('No authentication token available'))
        return
      }

      this.socket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3000', {
        auth: {
          token
        },
        transports: ['websocket', 'polling']
      })

      this.socket.on('connect', () => {
        console.log('WebSocket connected')
        resolve()
      })

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error)
        reject(error)
      })

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason)
      })

      // Set up event forwarding
      this.setupEventForwarding()
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.listeners.clear()
  }

  private setupEventForwarding(): void {
    if (!this.socket) return

    // Forward all events to registered listeners
    const events = [
      'case-created',
      'case-updated',
      'case-deleted',
      'case-assigned',
      'evidence-created',
      'evidence-updated',
      'evidence-deleted',
      'evidence-file-processed',
      'custody-transfer-requested',
      'custody-transfer-approved',
      'custody-transfer-rejected',
      'custody-transfer-completed',
      'job-progress',
      'file-processing-completed',
      'file-processing-failed',
      'user-activity',
      'system-notification'
    ]

    events.forEach(event => {
      this.socket!.on(event, (data) => {
        this.notifyListeners(event, data)
      })
    })
  }

  on(event: string, listener: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)

    // Return unsubscribe function
    return () => {
      this.off(event, listener)
    }
  }

  off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(listener)
      if (eventListeners.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  private notifyListeners(event: string, data: any): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data)
        } catch (error) {
          console.error(`Error in WebSocket listener for ${event}:`, error)
        }
      })
    }
  }

  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    }
  }

  // Convenience methods for common events
  onCaseUpdated(listener: (caseData: any) => void): () => void {
    return this.on('case-updated', listener)
  }

  onEvidenceUpdated(listener: (evidenceData: any) => void): () => void {
    return this.on('evidence-updated', listener)
  }

  onFileProcessingProgress(listener: (data: { evidenceId: string; progress: number; status: string }) => void): () => void {
    return this.on('job-progress', listener)
  }

  onFileProcessingCompleted(listener: (data: { evidenceId: string; metadata: any }) => void): () => void {
    return this.on('evidence-file-processed', listener)
  }

  onCustodyTransferUpdated(listener: (transferData: any) => void): () => void {
    return this.on('custody-transfer-approved', listener)
  }

  onSystemNotification(listener: (notification: { type: string; message: string; data?: any }) => void): () => void {
    return this.on('system-notification', listener)
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }
}

export const WebSocketService = new WebSocketServiceClass()
export default WebSocketService