'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket, useRealtimeUpdates } from '@/hooks/useWebSocket'
import { Tag, Grid } from '@carbon/react'
import { 
  UserMultiple, 
  FolderOpen, 
  Document, 
  Activity,
  TrendingUp,
  Time,
  CheckmarkFilled,
  WarningFilled
} from '@carbon/icons-react'
import CaseService from '@/services/cases'
import EvidenceService from '@/services/evidence'
import UserService from '@/services/users'
import { Case, EvidenceItem, User } from '@/types'

interface DashboardStats {
  totalCases: number
  activeCases: number
  totalEvidence: number
  pendingEvidence: number
  totalUsers: number
  activeUsers: number
  recentActivity: any[]
}

export default function Dashboard() {
  const { user } = useAuth()
  const { isConnected } = useWebSocket()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentCases, setRecentCases] = useState<Case[]>([])
  const [recentEvidence, setRecentEvidence] = useState<EvidenceItem[]>([])

  // Use real-time updates for live stats
  const [liveStats] = useRealtimeUpdates('dashboard-stats', stats, (current, update) => {
    return { ...current, ...update }
  })

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load stats in parallel
      const [casesResponse, evidenceResponse, usersResponse] = await Promise.allSettled([
        CaseService.getCases({ limit: 5 }),
        EvidenceService.getEvidenceItems({ limit: 5 }),
        UserService.getUsers({ limit: 10 })
      ])

      // Calculate stats
      const casesData = casesResponse.status === 'fulfilled' ? casesResponse.value : null
      const evidenceData = evidenceResponse.status === 'fulfilled' ? evidenceResponse.value : null
      const usersData = usersResponse.status === 'fulfilled' ? usersResponse.value : null

      const dashboardStats: DashboardStats = {
        totalCases: casesData?.total || 0,
        activeCases: casesData?.items.filter(c => c.status === 'OPEN').length || 0,
        totalEvidence: evidenceData?.total || 0,
        pendingEvidence: evidenceData?.items.filter(e => e.status === 'PROCESSING').length || 0,
        totalUsers: usersData?.total || 0,
        activeUsers: usersData?.items.filter(u => u.isActive).length || 0,
        recentActivity: []
      }

      setStats(dashboardStats)
      if (casesData) setRecentCases(casesData.items)
      if (evidenceData) setRecentEvidence(evidenceData.items)

    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusTag = (status: string) => {
    const statusConfig = {
      OPEN: { type: 'green' as const, label: 'Open' },
      CLOSED: { type: 'gray' as const, label: 'Closed' },
      PENDING: { type: 'yellow' as const, label: 'Pending' },
      ARCHIVED: { type: 'blue' as const, label: 'Archived' },
      COLLECTED: { type: 'green' as const, label: 'Collected' },
      PROCESSING: { type: 'yellow' as const, label: 'Processing' },
      ANALYZED: { type: 'blue' as const, label: 'Analyzed' },
      STORED: { type: 'gray' as const, label: 'Stored' },
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.CLOSED
    return (
      <Tag type={config.type} size="sm">
        {config.label}
      </Tag>
    )
  }

  const getPriorityTag = (priority: string) => {
    const priorityConfig = {
      LOW: { type: 'gray' as const, label: 'Low' },
      MEDIUM: { type: 'yellow' as const, label: 'Medium' },
      HIGH: { type: 'orange' as const, label: 'High' },
      CRITICAL: { type: 'red' as const, label: 'Critical' },
    }
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.LOW
    return (
      <Tag type={config.type} size="sm">
        {config.label}
      </Tag>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--cds-text-primary)' }}>
              Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
              Welcome back, {user?.firstName} {user?.lastName}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading dashboard..." />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <Grid>
              <Card className="mb-4">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
                  <FolderOpen size={20} className="text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ color: 'var(--cds-text-primary)' }}>
                    {liveStats?.totalCases || stats?.totalCases || 0}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                    {liveStats?.activeCases || stats?.activeCases || 0} active
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Evidence Items</CardTitle>
                  <Document size={20} className="text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ color: 'var(--cds-text-primary)' }}>
                    {liveStats?.totalEvidence || stats?.totalEvidence || 0}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                    {liveStats?.pendingEvidence || stats?.pendingEvidence || 0} processing
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <UserMultiple size={20} className="text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ color: 'var(--cds-text-primary)' }}>
                    {liveStats?.activeUsers || stats?.activeUsers || 0}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                    of {liveStats?.totalUsers || stats?.totalUsers || 0} total
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Status</CardTitle>
                  <Activity size={20} className="text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Operational</div>
                  <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                    All systems running
                  </p>
                </CardContent>
              </Card>
            </Grid>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Cases */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Cases</CardTitle>
                  <CardDescription>Latest case activities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentCases.map((case_) => (
                      <div key={case_.id} className="flex items-center justify-between p-3" style={{ backgroundColor: 'var(--cds-layer-01)', borderRadius: '4px' }}>
                        <div className="flex-1">
                          <div className="font-medium" style={{ color: 'var(--cds-text-primary)' }}>
                            {case_.title}
                          </div>
                          <div className="text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
                            #{case_.caseNumber}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getPriorityTag(case_.priority)}
                          {getStatusTag(case_.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Evidence */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Evidence</CardTitle>
                  <CardDescription>Latest evidence items</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentEvidence.map((evidence) => (
                      <div key={evidence.id} className="flex items-center justify-between p-3" style={{ backgroundColor: 'var(--cds-layer-01)', borderRadius: '4px' }}>
                        <div className="flex-1">
                          <div className="font-medium" style={{ color: 'var(--cds-text-primary)' }}>
                            {evidence.title}
                          </div>
                          <div className="text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
                            #{evidence.itemNumber}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                            {evidence.type}
                          </span>
                          {getStatusTag(evidence.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}