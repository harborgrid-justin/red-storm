import { apiService } from './api'
import { User, ApiResponse, PaginatedResponse } from '@/types'

class UserServiceClass {
  async getUsers(params?: {
    page?: number
    limit?: number
    search?: string
    role?: string
    isActive?: boolean
  }): Promise<PaginatedResponse<User>> {
    const response = await apiService.get<ApiResponse<PaginatedResponse<User>>>('/users', params)
    return response.data.data
  }

  async getUser(id: string): Promise<User> {
    const response = await apiService.get<ApiResponse<User>>(`/users/${id}`)
    return response.data.data
  }

  async createUser(userData: {
    email: string
    password: string
    firstName: string
    lastName: string
    username?: string
    roles?: string[]
  }): Promise<User> {
    const response = await apiService.post<ApiResponse<User>>('/users', userData)
    return response.data.data
  }

  async updateUser(id: string, userData: Partial<{
    email: string
    firstName: string
    lastName: string
    username: string
    isActive: boolean
    roles: string[]
  }>): Promise<User> {
    const response = await apiService.put<ApiResponse<User>>(`/users/${id}`, userData)
    return response.data.data
  }

  async deleteUser(id: string): Promise<void> {
    await apiService.delete(`/users/${id}`)
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<User> {
    const response = await apiService.patch<ApiResponse<User>>(`/users/${id}/status`, {
      isActive
    })
    return response.data.data
  }

  async assignRole(userId: string, roleId: string): Promise<User> {
    const response = await apiService.post<ApiResponse<User>>(`/users/${userId}/roles`, {
      roleId
    })
    return response.data.data
  }

  async removeRole(userId: string, roleId: string): Promise<User> {
    const response = await apiService.delete<ApiResponse<User>>(`/users/${userId}/roles/${roleId}`)
    return response.data.data
  }

  async updatePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    await apiService.patch(`/users/${id}/password`, {
      currentPassword,
      newPassword
    })
  }

  async resetPassword(email: string): Promise<void> {
    await apiService.post('/users/reset-password', { email })
  }
}

export const UserService = new UserServiceClass()
export default UserService