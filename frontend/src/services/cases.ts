import { apiService } from './api'
import { Case, CreateCaseRequest, ApiResponse, PaginatedResponse } from '@/types'

class CaseServiceClass {
  async getCases(params?: {
    page?: number
    limit?: number
    status?: string
    priority?: string
    search?: string
    assignedToId?: string
  }): Promise<PaginatedResponse<Case>> {
    const response = await apiService.get<ApiResponse<PaginatedResponse<Case>>>('/cases', params)
    return response.data.data
  }

  async getCase(id: string): Promise<Case> {
    const response = await apiService.get<ApiResponse<Case>>(`/cases/${id}`)
    return response.data.data
  }

  async createCase(caseData: CreateCaseRequest): Promise<Case> {
    const response = await apiService.post<ApiResponse<Case>>('/cases', caseData)
    return response.data.data
  }

  async updateCase(id: string, caseData: Partial<CreateCaseRequest>): Promise<Case> {
    const response = await apiService.put<ApiResponse<Case>>(`/cases/${id}`, caseData)
    return response.data.data
  }

  async deleteCase(id: string): Promise<void> {
    await apiService.delete(`/cases/${id}`)
  }

  async assignCase(caseId: string, userId: string): Promise<Case> {
    const response = await apiService.patch<ApiResponse<Case>>(`/cases/${caseId}/assign`, {
      assignedToId: userId
    })
    return response.data.data
  }

  async updateCaseStatus(caseId: string, status: string): Promise<Case> {
    const response = await apiService.patch<ApiResponse<Case>>(`/cases/${caseId}/status`, {
      status
    })
    return response.data.data
  }

  async addCaseTag(caseId: string, tagName: string): Promise<Case> {
    const response = await apiService.post<ApiResponse<Case>>(`/cases/${caseId}/tags`, {
      tagName
    })
    return response.data.data
  }

  async removeCaseTag(caseId: string, tagId: string): Promise<Case> {
    const response = await apiService.delete<ApiResponse<Case>>(`/cases/${caseId}/tags/${tagId}`)
    return response.data.data
  }
}

export const CaseService = new CaseServiceClass()
export default CaseService