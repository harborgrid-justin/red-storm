'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket, useRealtimeUpdates } from '@/hooks/useWebSocket'
import { 
  Users, 
  FolderOpen, 
  FileText, 
  Activity,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
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

  const getStatusBadge = (status: string) => {
    const badges = {
      OPEN: 'bg-green-100 text-green-800',
      CLOSED: 'bg-gray-100 text-gray-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
      ARCHIVED: 'bg-blue-100 text-blue-800',
      COLLECTED: 'bg-green-100 text-green-800',
      PROCESSING: 'bg-yellow-100 text-yellow-800',
      ANALYZED: 'bg-blue-100 text-blue-800',
      STORED: 'bg-gray-100 text-gray-800',
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityBadge = (priority: string) => {
    const badges = {
      LOW: 'bg-gray-100 text-gray-800',
      MEDIUM: 'bg-yellow-100 text-yellow-800',
      HIGH: 'bg-orange-100 text-orange-800',
      CRITICAL: 'bg-red-100 text-red-800',
    }
    return badges[priority as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Welcome back, {user?.firstName} {user?.lastName}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{liveStats?.totalCases || stats?.totalCases || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {liveStats?.activeCases || stats?.activeCases || 0} active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Evidence Items</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{liveStats?.totalEvidence || stats?.totalEvidence || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {liveStats?.pendingEvidence || stats?.pendingEvidence || 0} processing
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{liveStats?.activeUsers || stats?.activeUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    of {liveStats?.totalUsers || stats?.totalUsers || 0} total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">System Status</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Operational</div>
                  <p className="text-xs text-muted-foreground">
                    All systems running
                  </p>
                </CardContent>
              </Card>
            </div>

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
                      <div key={case_.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{case_.title}</div>
                          <div className="text-sm text-gray-500">#{case_.caseNumber}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadge(case_.priority)}`}>
                            {case_.priority}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(case_.status)}`}>
                            {case_.status}
                          </span>
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
                      <div key={evidence.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{evidence.title}</div>
                          <div className="text-sm text-gray-500">#{evidence.itemNumber}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500">{evidence.type}</span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(evidence.status)}`}>
                            {evidence.status}
                          </span>
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