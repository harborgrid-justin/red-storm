import { apiService } from './api'
import { EvidenceItem, CreateEvidenceRequest, FileUploadRequest, ApiResponse, PaginatedResponse, ChainOfCustodyEntry, CustodyTransfer } from '@/types'

class EvidenceServiceClass {
  async getEvidenceItems(params?: {
    page?: number
    limit?: number
    caseId?: string
    type?: string
    status?: string
    search?: string
  }): Promise<PaginatedResponse<EvidenceItem>> {
    const response = await apiService.get<ApiResponse<PaginatedResponse<EvidenceItem>>>('/evidence', params)
    return response.data.data
  }

  async getEvidenceItem(id: string): Promise<EvidenceItem> {
    const response = await apiService.get<ApiResponse<EvidenceItem>>(`/evidence/${id}`)
    return response.data.data
  }

  async createEvidence(evidenceData: CreateEvidenceRequest): Promise<EvidenceItem> {
    const response = await apiService.post<ApiResponse<EvidenceItem>>('/evidence', evidenceData)
    return response.data.data
  }

  async updateEvidence(id: string, evidenceData: Partial<CreateEvidenceRequest>): Promise<EvidenceItem> {
    const response = await apiService.put<ApiResponse<EvidenceItem>>(`/evidence/${id}`, evidenceData)
    return response.data.data
  }

  async deleteEvidence(id: string): Promise<void> {
    await apiService.delete(`/evidence/${id}`)
  }

  async updateEvidenceStatus(evidenceId: string, status: string): Promise<EvidenceItem> {
    const response = await apiService.patch<ApiResponse<EvidenceItem>>(`/evidence/${evidenceId}/status`, {
      status
    })
    return response.data.data
  }

  // File operations
  async uploadFile(fileData: FileUploadRequest, onProgress?: (progress: number) => void): Promise<EvidenceItem[]> {
    const formData = new FormData()
    
    // Add metadata
    formData.append('caseId', fileData.caseId)
    formData.append('title', fileData.title)
    if (fileData.description) formData.append('description', fileData.description)
    formData.append('type', fileData.type)
    if (fileData.location) formData.append('location', fileData.location)
    if (fileData.tags && fileData.tags.length > 0) {
      formData.append('tags', JSON.stringify(fileData.tags))
    }
    
    // Add files
    Array.from(fileData.files).forEach((file, index) => {
      formData.append('files', file)
    })
    
    const response = await apiService.upload<ApiResponse<{ evidenceItems: EvidenceItem[] }>>(
      '/evidence-files/upload',
      formData,
      onProgress
    )
    
    return response.data.data.evidenceItems
  }

  async getProcessingStatus(evidenceId: string): Promise<{
    status: string
    progress: number
    metadata?: Record<string, any>
    error?: string
  }> {
    const response = await apiService.get<ApiResponse<any>>(`/evidence-files/${evidenceId}/processing-status`)
    return response.data.data
  }

  async verifyFileIntegrity(evidenceId: string): Promise<{
    verified: boolean
    currentHash: string
    originalHash: string
    algorithm: string
    verifiedAt: string
  }> {
    const response = await apiService.post<ApiResponse<any>>(`/evidence-files/${evidenceId}/verify`)
    return response.data.data.verification
  }

  // Chain of custody operations
  async getChainOfCustody(evidenceId: string): Promise<ChainOfCustodyEntry[]> {
    const response = await apiService.get<ApiResponse<ChainOfCustodyEntry[]>>(`/evidence/${evidenceId}/chain-of-custody`)
    return response.data.data
  }

  async requestTransfer(transferData: {
    evidenceId: string
    toUserId: string
    reason: string
    location: string
    approvalRequired?: boolean
    approvers?: string[]
    scheduledAt?: string
    notes?: string
  }): Promise<CustodyTransfer> {
    const response = await apiService.post<ApiResponse<CustodyTransfer>>(
      `/evidence-files/${transferData.evidenceId}/transfer`,
      transferData
    )
    return response.data.data
  }

  async approveTransfer(transferId: string, notes?: string): Promise<CustodyTransfer> {
    const response = await apiService.post<ApiResponse<CustodyTransfer>>(
      `/evidence-files/transfers/${transferId}/approve`,
      { notes }
    )
    return response.data.data
  }

  async rejectTransfer(transferId: string, notes?: string): Promise<CustodyTransfer> {
    const response = await apiService.post<ApiResponse<CustodyTransfer>>(
      `/evidence-files/transfers/${transferId}/reject`,
      { notes }
    )
    return response.data.data
  }

  async getTransfers(evidenceId?: string): Promise<CustodyTransfer[]> {
    const params = evidenceId ? { evidenceId } : {}
    const response = await apiService.get<ApiResponse<CustodyTransfer[]>>('/evidence-files/transfers', params)
    return response.data.data
  }

  // File download
  getFileUrl(evidenceId: string): string {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/evidence-files/${evidenceId}/download`
  }

  getThumbnailUrl(evidenceId: string, size: 'small' | 'medium' | 'large' = 'medium'): string {
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/evidence-files/${evidenceId}/thumbnail?size=${size}`
  }
}

export const EvidenceService = new EvidenceServiceClass()
export default EvidenceService