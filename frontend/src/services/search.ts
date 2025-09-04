import { apiService } from './api'
import { ApiResponse } from '@/types'

export interface SearchResult {
  id: string
  type: 'case' | 'evidence' | 'document'
  title: string
  subtitle: string
  description?: string
  content?: string
  status: string
  priority?: string
  createdAt: string
  metadata: Record<string, unknown>
  score: number
  highlights?: Record<string, string[]>
  caseId?: string
  evidenceId?: string
}

export interface SearchResponse {
  results: SearchResult[]
  total: {
    value: number
    relation: 'eq' | 'gte'
  }
  aggregations?: Record<string, unknown>
  suggestions?: Record<string, unknown>
  took: number
}

export interface SearchFilters {
  type?: 'case' | 'evidence' | 'document'
  status?: string
  priority?: string
  caseId?: string
  evidenceType?: string
  dateFrom?: string
  dateTo?: string
  tags?: string[]
  assignedTo?: string
}

export interface SearchParams {
  q?: string
  type?: string
  status?: string
  priority?: string
  caseId?: string
  evidenceType?: string
  dateFrom?: string
  dateTo?: string
  tags?: string
  assignedTo?: string
  from?: number
  size?: number
  highlight?: boolean
  suggest?: boolean
}

export interface SimilarityResult {
  id: string
  score: number
  type: 'text' | 'image' | 'audio'
  metadata: Record<string, unknown>
}

export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf'
  filename?: string
  includeMetadata?: boolean
  includeHighlights?: boolean
  customFields?: string[]
  searchQuery: unknown
}

export interface ExportResult {
  downloadUrl: string
  filename: string
  size: number
  recordCount: number
}

class SearchServiceClass {
  async search(params: SearchParams): Promise<SearchResponse> {
    const response = await apiService.get<ApiResponse<SearchResponse>>('/search/search', params)
    return response.data.data
  }

  async getSuggestions(q: string, size?: number): Promise<string[]> {
    const response = await apiService.get<ApiResponse<string[]>>('/search/suggestions', {
      q,
      size: size || 10,
    })
    return response.data.data
  }

  async exportSearchResults(options: ExportOptions): Promise<ExportResult> {
    const response = await apiService.post<ApiResponse<ExportResult>>('/search/export', options)
    return response.data.data
  }

  async downloadExport(filename: string): Promise<Blob> {
    const response = await apiService.get(`/search/download/${filename}`, {}, {
      responseType: 'blob',
    } as never)
    return response.data
  }

  async findSimilarText(
    text: string,
    options?: {
      algorithm?: 'tfidf' | 'jaccard' | 'dice' | 'levenshtein'
      threshold?: number
      maxResults?: number
    }
  ): Promise<SimilarityResult[]> {
    const response = await apiService.post<ApiResponse<SimilarityResult[]>>('/search/similarity/text', {
      text,
      ...options,
    })
    return response.data.data
  }

  async findSimilarImages(
    evidenceId: string,
    options?: {
      threshold?: number
      maxResults?: number
      hashType?: 'dhash' | 'average' | 'phash'
    }
  ): Promise<SimilarityResult[]> {
    const response = await apiService.post<ApiResponse<SimilarityResult[]>>('/search/similarity/image', {
      evidenceId,
      ...options,
    })
    return response.data.data
  }

  async findCrossCorrelations(
    evidenceId: string,
    threshold?: number
  ): Promise<Array<{
    relatedEvidenceId: string
    caseId: string
    correlationType: 'text' | 'image' | 'audio' | 'metadata'
    score: number
    details: Record<string, unknown>
  }>> {
    const response = await apiService.post<ApiResponse<unknown[]>>(`/search/correlation/${evidenceId}`, {
      threshold: threshold || 0.5,
    })
    return response.data.data as Array<{
      relatedEvidenceId: string
      caseId: string
      correlationType: 'text' | 'image' | 'audio' | 'metadata'
      score: number
      details: Record<string, unknown>
    }>
  }

  async processOCR(evidenceId: string, language?: string): Promise<{ jobId: string; message: string }> {
    const response = await apiService.post<ApiResponse<{ jobId: string; message: string }>>(
      `/search/ocr/${evidenceId}`,
      { language: language || 'eng' }
    )
    return response.data.data
  }

  async reindex(): Promise<{ message: string }> {
    const response = await apiService.post<ApiResponse<{ message: string }>>('/search/reindex')
    return response.data.data
  }

  // Helper method to build search URL for sharing
  buildSearchUrl(params: SearchParams): string {
    const searchParams = new URLSearchParams()
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','))
        } else {
          searchParams.append(key, String(value))
        }
      }
    })
    
    return `/search?${searchParams.toString()}`
  }

  // Parse search URL parameters
  parseSearchUrl(searchParams: URLSearchParams): SearchParams {
    const params: SearchParams = {}
    
    const q = searchParams.get('q')
    if (q) params.q = q
    
    const type = searchParams.get('type')
    if (type) params.type = type
    
    const status = searchParams.get('status')
    if (status) params.status = status
    
    const priority = searchParams.get('priority')
    if (priority) params.priority = priority
    
    const caseId = searchParams.get('caseId')
    if (caseId) params.caseId = caseId
    
    const evidenceType = searchParams.get('evidenceType')
    if (evidenceType) params.evidenceType = evidenceType
    
    const dateFrom = searchParams.get('dateFrom')
    if (dateFrom) params.dateFrom = dateFrom
    
    const dateTo = searchParams.get('dateTo')
    if (dateTo) params.dateTo = dateTo
    
    const tags = searchParams.get('tags')
    if (tags) params.tags = tags
    
    const assignedTo = searchParams.get('assignedTo')
    if (assignedTo) params.assignedTo = assignedTo
    
    const from = searchParams.get('from')
    if (from) params.from = parseInt(from)
    
    const size = searchParams.get('size')
    if (size) params.size = parseInt(size)
    
    const highlight = searchParams.get('highlight')
    if (highlight) params.highlight = highlight === 'true'
    
    const suggest = searchParams.get('suggest')
    if (suggest) params.suggest = suggest === 'true'
    
    return params
  }
}

export const SearchService = new SearchServiceClass()
export default SearchService