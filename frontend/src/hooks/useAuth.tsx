'use client'

import { useState, useEffect, useContext, createContext, ReactNode } from 'react'
import { User } from '@/types'
import { AuthService } from '@/services/auth'
import { WebSocketService } from '@/services/websocket'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
  hasRole: (roles: string | string[]) => boolean
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing auth on mount
    const initialize = async () => {
      try {
        const token = AuthService.getToken()
        if (token) {
          const currentUser = await AuthService.getCurrentUser()
          setUser(currentUser)
          
          // Connect to WebSocket if authenticated
          try {
            await WebSocketService.connect()
          } catch (wsError) {
            console.warn('Failed to connect to WebSocket:', wsError)
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error)
        AuthService.logout()
      } finally {
        setLoading(false)
      }
    }

    initialize()

    // Cleanup WebSocket on unmount
    return () => {
      WebSocketService.disconnect()
    }
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const authData = await AuthService.login({ email, password })
      setUser(authData.user)
      
      // Connect to WebSocket after successful login
      try {
        await WebSocketService.connect()
      } catch (wsError) {
        console.warn('Failed to connect to WebSocket after login:', wsError)
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await AuthService.logout()
      WebSocketService.disconnect()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    hasRole: (roles: string | string[]) => AuthService.hasRole(roles),
    hasPermission: (permission: string) => AuthService.hasPermission(permission)
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}