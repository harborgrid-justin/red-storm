import apiService from './api'

export interface AnalyticsData {
  totalCases: number
  activeCases: number
  closedCases: number
  totalEvidence: number
  evidenceByType: Record<string, number>
  casesByStatus: Record<string, number>
  casesByPriority: Record<string, number>
  averageCaseResolutionTime: number
  evidenceProcessingStats: {
    totalProcessed: number
    averageProcessingTime: number
    processingByType: Record<string, number>
  }
  userActivityStats: {
    activeUsers: number
    userLoginFrequency: Record<string, number>
    topUsers: Array<{ userId: string; activityCount: number; name: string }>
  }
  trendData: {
    casesOverTime: Array<{ date: string; count: number }>
    evidenceOverTime: Array<{ date: string; count: number }>
    resolutionTimesTrend: Array<{ date: string; averageTime: number }>
  }
  predictions: {
    expectedCaseResolutionTime: number
    resourceAllocationSuggestion: string
    caseloadPrediction: Array<{ date: string; predicted: number }>
  }
}

export interface KPIData {
  totalCases: number
  activeCases: number
  caseResolutionRate: number
  averageResolutionTime: number
  totalEvidence: number
  evidenceProcessingRate: number
  activeUsers: number
  systemEfficiency: number
}

export interface PerformanceMetrics {
  totalUsers: number
  activeUsers: number
  systemLoad: number
  storageUsed: number
  timestamp: string
}

export interface HeatmapData {
  x: number
  y: number
  value: number
  label?: string
}

export interface TrendData {
  casesOverTime: Array<{ date: string; count: number }>
  evidenceOverTime: Array<{ date: string; count: number }>
}

export interface PredictionData {
  expectedCaseResolutionTime: number
  resourceAllocationSuggestion: string
  caseloadPrediction: Array<{ date: string; predicted: number }>
}

class AnalyticsServiceClass {
  /**
   * Get comprehensive dashboard analytics
   */
  async getDashboardAnalytics(dateRange?: { from: string; to: string }): Promise<AnalyticsData> {
    const params = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    const response = await apiService.get('/analytics/dashboard', params)
    return response.data.data
  }

  /**
   * Get system performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const response = await apiService.get('/analytics/performance')
    return response.data.data
  }

  /**
   * Get evidence access heatmap data
   */
  async getEvidenceAccessHeatmap(): Promise<HeatmapData[]> {
    const response = await apiService.get('/analytics/heatmap/evidence-access')
    return response.data.data
  }

  /**
   * Get case trends over time
   */
  async getCaseTrends(dateRange?: { from: string; to: string }): Promise<{
    casesOverTime: Array<{ date: string; count: number }>
    resolutionTimesTrend: Array<{ date: string; averageTime: number }>
  }> {
    const params = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    const response = await apiService.get('/analytics/trends/cases', params)
    return response.data.data
  }

  /**
   * Get evidence trends over time
   */
  async getEvidenceTrends(dateRange?: { from: string; to: string }): Promise<{
    evidenceOverTime: Array<{ date: string; count: number }>
    evidenceByType: Record<string, number>
    processingStats: {
      totalProcessed: number
      averageProcessingTime: number
      processingByType: Record<string, number>
    }
  }> {
    const params = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    const response = await apiService.get('/analytics/trends/evidence', params)
    return response.data.data
  }

  /**
   * Get predictive analytics
   */
  async getPredictions(): Promise<PredictionData> {
    const response = await apiService.get('/analytics/predictions')
    return response.data.data
  }

  /**
   * Get key performance indicators
   */
  async getKPIs(dateRange?: { from: string; to: string }): Promise<KPIData> {
    const params = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    const response = await apiService.get('/analytics/kpis', params)
    return response.data.data
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(format: 'json' | 'csv' | 'pdf', dateRange?: { from: string; to: string }) {
    const params = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    
    if (format === 'json' || format === 'pdf') {
      const response = await apiService.get(`/analytics/export/${format}`, params)
      return response.data
    } else {
      // For CSV, we need to handle the response differently to get the file
      const url = new URL(`/api/v1/analytics/export/${format}`, window.location.origin)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) url.searchParams.append(key, value)
        })
      }
      
      // Trigger download
      const link = document.createElement('a')
      link.href = url.toString()
      link.download = `analytics_export.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  /**
   * Real-time analytics updates
   */
  subscribeToRealTimeUpdates(callback: (data: Partial<AnalyticsData>) => void): () => void {
    // This would integrate with WebSocket for real-time updates
    // For now, we'll simulate with polling
    const interval = setInterval(async () => {
      try {
        const performance = await this.getPerformanceMetrics()
        callback({ 
          userActivityStats: { 
            activeUsers: performance.activeUsers,
            userLoginFrequency: {},
            topUsers: []
          } 
        })
      } catch (error) {
        console.error('Failed to get real-time updates:', error)
      }
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }

  /**
   * Transform analytics data for KPI display
   */
  transformToKPIs(analytics: AnalyticsData): KPIData {
    return {
      totalCases: analytics.totalCases,
      activeCases: analytics.activeCases,
      caseResolutionRate: analytics.totalCases > 0 ? 
        (analytics.closedCases / analytics.totalCases * 100) : 0,
      averageResolutionTime: analytics.averageCaseResolutionTime,
      totalEvidence: analytics.totalEvidence,
      evidenceProcessingRate: analytics.totalEvidence > 0 ?
        (analytics.evidenceProcessingStats.totalProcessed / analytics.totalEvidence * 100) : 0,
      activeUsers: analytics.userActivityStats.activeUsers,
      systemEfficiency: analytics.averageCaseResolutionTime > 0 ? 
        Math.max(0, 100 - (analytics.averageCaseResolutionTime / 24)) : 0,
    }
  }

  /**
   * Generate date range for common periods
   */
  getDateRange(period: 'today' | 'week' | 'month' | 'quarter' | 'year'): { from: string; to: string } {
    const now = new Date()
    const to = now.toISOString()
    let from: Date

    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
      case 'quarter':
        from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        break
      case 'year':
        from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        break
      default:
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    return {
      from: from.toISOString(),
      to,
    }
  }

  /**
   * Calculate change percentage between two values
   */
  calculateChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
  }

  /**
   * Format numbers for display
   */
  formatNumber(value: number, type: 'number' | 'percentage' | 'time' = 'number'): string {
    switch (type) {
      case 'percentage':
        return `${value.toFixed(1)}%`
      case 'time':
        if (value < 1) {
          return `${(value * 60).toFixed(0)} min`
        }
        return `${value.toFixed(1)} hrs`
      default:
        return value.toLocaleString()
    }
  }
}

const AnalyticsService = new AnalyticsServiceClass()
export default AnalyticsService