'use client'

import { useState, useEffect } from 'react'
import { WebSocketService } from '@/services/websocket'

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(WebSocketService.isConnected())
    }

    // Check initial state
    checkConnection()

    // Set up connection monitoring
    const connectListener = () => setIsConnected(true)
    const disconnectListener = () => setIsConnected(false)

    WebSocketService.on('connect', connectListener)
    WebSocketService.on('disconnect', disconnectListener)

    // Check connection status periodically
    const interval = setInterval(checkConnection, 5000)

    return () => {
      WebSocketService.off('connect', connectListener)
      WebSocketService.off('disconnect', disconnectListener)
      clearInterval(interval)
    }
  }, [])

  return {
    isConnected,
    on: WebSocketService.on.bind(WebSocketService),
    off: WebSocketService.off.bind(WebSocketService),
    emit: WebSocketService.emit.bind(WebSocketService),
    connect: WebSocketService.connect.bind(WebSocketService),
    disconnect: WebSocketService.disconnect.bind(WebSocketService)
  }
}

export function useRealtimeUpdates<T>(
  eventName: string,
  initialData: T,
  updateFn?: (currentData: T, eventData: any) => T
): [T, (data: T) => void] {
  const [data, setData] = useState<T>(initialData)

  useEffect(() => {
    const unsubscribe = WebSocketService.on(eventName, (eventData: any) => {
      if (updateFn) {
        setData(current => updateFn(current, eventData))
      } else {
        setData(eventData)
      }
    })

    return unsubscribe
  }, [eventName, updateFn])

  return [data, setData]
}