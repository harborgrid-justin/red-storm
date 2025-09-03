import { apiService } from './api'
import { AuthResponse, LoginRequest, User, ApiResponse } from '@/types'

class AuthServiceClass {
  private tokenKey = 'evidence_platform_token'
  private refreshTokenKey = 'evidence_platform_refresh_token'
  private userKey = 'evidence_platform_user'

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await apiService.post<ApiResponse<AuthResponse>>('/auth/login', credentials)
    const authData = response.data.data
    
    // Store tokens and user data
    this.setToken(authData.accessToken)
    this.setRefreshToken(authData.refreshToken)
    this.setUser(authData.user)
    
    return authData
  }

  async logout(): Promise<void> {
    try {
      // Call logout endpoint to invalidate tokens on server
      await apiService.post('/auth/logout')
    } catch (error) {
      // Continue with local logout even if server logout fails
      console.error('Server logout failed:', error)
    }
    
    // Clear local storage
    this.clearTokens()
    this.clearUser()
  }

  async refreshToken(): Promise<string> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiService.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {
      refreshToken
    })
    
    const newToken = response.data.data.accessToken
    this.setToken(newToken)
    return newToken
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiService.get<ApiResponse<User>>('/auth/me')
    const user = response.data.data
    this.setUser(user)
    return user
  }

  async register(userData: {
    email: string
    password: string
    firstName: string
    lastName: string
    username?: string
  }): Promise<AuthResponse> {
    const response = await apiService.post<ApiResponse<AuthResponse>>('/auth/register', userData)
    const authData = response.data.data
    
    // Store tokens and user data
    this.setToken(authData.accessToken)
    this.setRefreshToken(authData.refreshToken)
    this.setUser(authData.user)
    
    return authData
  }

  // Token management
  getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(this.tokenKey)
  }

  setToken(token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(this.tokenKey, token)
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(this.refreshTokenKey)
  }

  setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(this.refreshTokenKey, token)
  }

  clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.tokenKey)
    localStorage.removeItem(this.refreshTokenKey)
  }

  // User management
  getUser(): User | null {
    if (typeof window === 'undefined') return null
    const userStr = localStorage.getItem(this.userKey)
    return userStr ? JSON.parse(userStr) : null
  }

  setUser(user: User): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(this.userKey, JSON.stringify(user))
  }

  clearUser(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(this.userKey)
  }

  // Auth status
  isAuthenticated(): boolean {
    return !!this.getToken()
  }

  hasRole(roleNames: string | string[]): boolean {
    const user = this.getUser()
    if (!user) return false
    
    const roles = Array.isArray(roleNames) ? roleNames : [roleNames]
    return user.roles.some(role => roles.includes(role.name))
  }

  hasPermission(permission: string): boolean {
    const user = this.getUser()
    if (!user) return false
    
    return user.roles.some(role => 
      role.permissions && role.permissions[permission] === true
    )
  }
}

export const AuthService = new AuthServiceClass()
export default AuthService