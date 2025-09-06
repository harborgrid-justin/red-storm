'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MainLayout } from '@/components/layout/main-layout'
import { Tag } from '@carbon/react'
import { 
  UserMultiple, 
  FolderOpen, 
  Document, 
  Activity,
} from '@carbon/icons-react'

// Mock data for demonstration
const mockStats = {
  totalCases: 156,
  activeCases: 42,
  totalEvidence: 1247,
  pendingEvidence: 18,
  totalUsers: 24,
  activeUsers: 16,
}

const mockCases = [
  { id: 1, title: 'Digital Fraud Investigation', caseNumber: 'CASE-2024-001', priority: 'HIGH', status: 'OPEN' },
  { id: 2, title: 'Cybersecurity Incident', caseNumber: 'CASE-2024-002', priority: 'CRITICAL', status: 'PROCESSING' },
  { id: 3, title: 'Financial Crime Analysis', caseNumber: 'CASE-2024-003', priority: 'MEDIUM', status: 'ANALYZED' },
]

const mockEvidence = [
  { id: 1, title: 'Email Communications', itemNumber: 'EVD-2024-001', type: 'Digital', status: 'COLLECTED' },
  { id: 2, title: 'Financial Records', itemNumber: 'EVD-2024-002', type: 'Document', status: 'PROCESSING' },
  { id: 3, title: 'Mobile Device Data', itemNumber: 'EVD-2024-003', type: 'Digital', status: 'ANALYZED' },
]

export default function CarbonDashboard() {
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
              Evidence Management Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
              Carbon Design System Implementation Demo
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm" style={{ color: 'var(--cds-text-secondary)' }}>
              System Operational
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
              <FolderOpen size={20} className="text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: 'var(--cds-text-primary)' }}>
                {mockStats.totalCases}
              </div>
              <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                {mockStats.activeCases} active
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
                {mockStats.totalEvidence}
              </div>
              <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                {mockStats.pendingEvidence} processing
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
                {mockStats.activeUsers}
              </div>
              <p className="text-xs" style={{ color: 'var(--cds-text-secondary)' }}>
                of {mockStats.totalUsers} total
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
                {mockCases.map((case_) => (
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
                {mockEvidence.map((evidence) => (
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
      </div>
    </MainLayout>
  )
}