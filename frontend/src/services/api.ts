import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { AuthService } from './auth'

class ApiService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      const token = AuthService.getToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Response interceptor to handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          try {
            // Try to refresh token
            await AuthService.refreshToken()
            // Retry the original request
            const token = AuthService.getToken()
            if (token && error.config) {
              error.config.headers.Authorization = `Bearer ${token}`
              return this.client.request(error.config)
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            AuthService.logout()
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T>(url: string, params?: any): Promise<AxiosResponse<T>> {
    return this.client.get(url, { params })
  }

  async post<T>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.client.post(url, data, config)
  }

  async put<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.client.put(url, data)
  }

  async patch<T>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.client.patch(url, data)
  }

  async delete<T>(url: string): Promise<AxiosResponse<T>> {
    return this.client.delete(url)
  }

  // File upload method
  async upload<T>(url: string, formData: FormData, onProgress?: (progress: number) => void): Promise<AxiosResponse<T>> {
    return this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress ? (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      } : undefined,
    })
  }
}

export const apiService = new ApiService()
export default apiService