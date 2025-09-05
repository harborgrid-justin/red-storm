'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { 
  BarChart3,
  Download,
  RefreshCw,
  Calendar,
  TrendingUp,
  AlertCircle,
  Info
} from 'lucide-react'

// Analytics components
import { 
  CasesTrendChart, 
  EvidenceByTypeChart, 
  CasesByStatusChart,
  ResolutionTimesTrendChart,
  UserActivityChart
} from '@/components/charts/AnalyticsCharts'
import { KPIDashboard } from '@/components/charts/KPIWidgets'

// Services
import AnalyticsService, { AnalyticsData, KPIData } from '@/services/analytics'

export default function AnalyticsPage() {
  const { user } = useAuth()
  const { isConnected } = useWebSocket()
  
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('month')
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | null>(null)
  const [realTimeUpdates, setRealTimeUpdates] = useState(true)

  // Load analytics data
  const loadAnalyticsData = async (period?: typeof selectedPeriod, dateRange?: { from: Date; to: Date }) => {
    try {
      setError(null)
      
      let queryDateRange: { from: string; to: string } | undefined
      
      if (dateRange) {
        queryDateRange = {
          from: dateRange.from.toISOString(),
          to: dateRange.to.toISOString(),
        }
      } else if (period) {
        queryDateRange = AnalyticsService.getDateRange(period)
      }
      
      const [analyticsData, kpiData] = await Promise.all([
        AnalyticsService.getDashboardAnalytics(queryDateRange),
        AnalyticsService.getKPIs(queryDateRange),
      ])
      
      setAnalytics(analyticsData)
      setKpis(kpiData)
    } catch (error) {
      console.error('Failed to load analytics data:', error)
      setError('Failed to load analytics data. Please try again.')
    }
  }

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await loadAnalyticsData(selectedPeriod, customDateRange)
      setLoading(false)
    }
    
    loadData()
  }, [selectedPeriod, customDateRange])

  // Real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return

    const unsubscribe = AnalyticsService.subscribeToRealTimeUpdates((updates) => {
      if (analytics && updates.userActivityStats) {
        setAnalytics(prev => prev ? {
          ...prev,
          userActivityStats: {
            ...prev.userActivityStats,
            ...updates.userActivityStats,
          },
        } : null)
      }
    })

    return unsubscribe
  }, [analytics, realTimeUpdates])

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAnalyticsData(selectedPeriod, customDateRange)
    setRefreshing(false)
  }

  // Export data
  const handleExport = async (format: 'json' | 'csv' | 'pdf') => {
    try {
      let queryDateRange: { from: string; to: string } | undefined
      
      if (customDateRange) {
        queryDateRange = {
          from: customDateRange.from.toISOString(),
          to: customDateRange.to.toISOString(),
        }
      } else {
        queryDateRange = AnalyticsService.getDateRange(selectedPeriod)
      }
      
      await AnalyticsService.exportAnalytics(format, queryDateRange)
    } catch (error) {
      console.error('Failed to export analytics:', error)
    }
  }

  // Handle period change
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period as typeof selectedPeriod)
    setCustomDateRange(null) // Clear custom range when period changes
  }

  // Handle custom date range
  const handleDateRangeChange = (range: { from: Date; to: Date } | null) => {
    setCustomDateRange(range)
    if (range) {
      setSelectedPeriod('month') // Reset period when custom range is selected
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner size="lg" text="Loading analytics..." />
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Analytics</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive insights into case management and evidence processing
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-md ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm font-medium">
                {isConnected ? 'Real-time' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Time Period & Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="period" className="text-sm font-medium">Period:</label>
                <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last Week</SelectItem>
                    <SelectItem value="month">Last Month</SelectItem>
                    <SelectItem value="quarter">Last Quarter</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Custom Range:</label>
                <DatePickerWithRange
                  value={customDateRange}
                  onChange={handleDateRangeChange}
                  placeholder="Select date range"
                />
              </div>

              <div className="flex items-center space-x-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv')}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Dashboard */}
        {kpis && (
          <div>
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Key Performance Indicators
            </h2>
            <KPIDashboard analytics={kpis} />
          </div>
        )}

        {/* Charts Grid */}
        {analytics && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Analytics Charts
            </h2>

            {/* Top Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cases Trend</CardTitle>
                  <CardDescription>Number of cases created over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <CasesTrendChart data={analytics.trendData.casesOverTime} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Evidence by Type</CardTitle>
                  <CardDescription>Distribution of evidence types</CardDescription>
                </CardHeader>
                <CardContent>
                  <EvidenceByTypeChart data={analytics.evidenceByType} />
                </CardContent>
              </Card>
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cases by Status</CardTitle>
                  <CardDescription>Current case status distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <CasesByStatusChart data={analytics.casesByStatus} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resolution Times</CardTitle>
                  <CardDescription>Average case resolution time trend</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResolutionTimesTrendChart data={analytics.trendData.resolutionTimesTrend} />
                </CardContent>
              </Card>
            </div>

            {/* Third Row */}
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>User Activity</CardTitle>
                  <CardDescription>Most active users in the system</CardDescription>
                </CardHeader>
                <CardContent>
                  <UserActivityChart data={analytics.userActivityStats.topUsers} />
                </CardContent>
              </Card>
            </div>

            {/* Predictions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Predictive Insights
                </CardTitle>
                <CardDescription>AI-powered predictions and recommendations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-900">Expected Resolution Time</h4>
                    <p className="text-2xl font-bold text-blue-600">
                      {AnalyticsService.formatNumber(analytics.predictions.expectedCaseResolutionTime, 'time')}
                    </p>
                    <p className="text-sm text-blue-700">For new cases</p>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-900">Resource Allocation</h4>
                    <p className="text-sm text-green-700">
                      {analytics.predictions.resourceAllocationSuggestion}
                    </p>
                  </div>
                </div>

                {analytics.predictions.caseloadPrediction.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">7-Day Caseload Prediction</h4>
                    <div className="grid grid-cols-7 gap-2">
                      {analytics.predictions.caseloadPrediction.map((prediction, index) => (
                        <div key={index} className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-600">
                            {new Date(prediction.date).toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div className="text-lg font-semibold">{prediction.predicted}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  )
}