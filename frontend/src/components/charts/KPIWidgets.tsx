'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  FolderOpen,
  FileText,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Target,
  BarChart3,
  Zap
} from 'lucide-react'

interface KPIWidgetProps {
  title: string
  value: string | number
  description?: string
  change?: {
    value: number
    type: 'increase' | 'decrease' | 'neutral'
    period?: string
  }
  icon?: React.ReactNode
  format?: 'number' | 'percentage' | 'currency' | 'time'
  trend?: Array<number>
  color?: 'default' | 'green' | 'red' | 'blue' | 'yellow'
}

export function KPIWidget({ 
  title, 
  value, 
  description, 
  change, 
  icon, 
  format = 'number',
  color = 'default'
}: KPIWidgetProps) {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val
    
    switch (format) {
      case 'percentage':
        return `${val.toFixed(1)}%`
      case 'currency':
        return new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD' 
        }).format(val)
      case 'time':
        if (val < 1) {
          return `${(val * 60).toFixed(0)} min`
        }
        return `${val.toFixed(1)} hrs`
      default:
        return val.toLocaleString()
    }
  }

  const getTrendIcon = () => {
    if (!change) return null
    
    switch (change.type) {
      case 'increase':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'decrease':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-500" />
    }
  }

  const getChangeColor = () => {
    if (!change) return 'text-muted-foreground'
    
    switch (change.type) {
      case 'increase':
        return 'text-green-600'
      case 'decrease':
        return 'text-red-600'
      default:
        return 'text-muted-foreground'
    }
  }

  const getCardBorderColor = () => {
    switch (color) {
      case 'green':
        return 'border-l-green-500 border-l-4'
      case 'red':
        return 'border-l-red-500 border-l-4'
      case 'blue':
        return 'border-l-blue-500 border-l-4'
      case 'yellow':
        return 'border-l-yellow-500 border-l-4'
      default:
        return ''
    }
  }

  return (
    <Card className={`${getCardBorderColor()}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {change && (
          <div className={`flex items-center text-xs mt-2 ${getChangeColor()}`}>
            {getTrendIcon()}
            <span className="ml-1">
              {change.value > 0 ? '+' : ''}{change.value}
              {format === 'percentage' ? 'pp' : '%'}
              {change.period && ` ${change.period}`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Preset KPI widgets
export function TotalCasesKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Total Cases"
      value={value}
      description="All cases in the system"
      icon={<FolderOpen className="h-4 w-4" />}
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last month'
      } : undefined}
      color="blue"
    />
  )
}

export function ActiveCasesKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Active Cases"
      value={value}
      description="Currently open cases"
      icon={<Activity className="h-4 w-4" />}
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last week'
      } : undefined}
      color="green"
    />
  )
}

export function CaseResolutionRateKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Resolution Rate"
      value={value}
      description="Percentage of closed cases"
      icon={<CheckCircle className="h-4 w-4" />}
      format="percentage"
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last month'
      } : undefined}
      color="green"
    />
  )
}

export function AverageResolutionTimeKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Avg Resolution Time"
      value={value}
      description="Average time to close cases"
      icon={<Clock className="h-4 w-4" />}
      format="time"
      change={change ? {
        value: change,
        type: change < 0 ? 'increase' : change > 0 ? 'decrease' : 'neutral', // Lower time is better
        period: 'from last month'
      } : undefined}
      color="yellow"
    />
  )
}

export function TotalEvidenceKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Total Evidence"
      value={value}
      description="Evidence items in system"
      icon={<FileText className="h-4 w-4" />}
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last month'
      } : undefined}
      color="blue"
    />
  )
}

export function EvidenceProcessingRateKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Processing Rate"
      value={value}
      description="Evidence processing completion"
      icon={<Zap className="h-4 w-4" />}
      format="percentage"
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last month'
      } : undefined}
      color="green"
    />
  )
}

export function ActiveUsersKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="Active Users"
      value={value}
      description="Users active in last 24h"
      icon={<Users className="h-4 w-4" />}
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from yesterday'
      } : undefined}
      color="blue"
    />
  )
}

export function SystemEfficiencyKPI({ value, change }: { value: number; change?: number }) {
  return (
    <KPIWidget
      title="System Efficiency"
      value={value}
      description="Overall system performance"
      icon={<Target className="h-4 w-4" />}
      format="percentage"
      change={change ? {
        value: change,
        type: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
        period: 'from last week'
      } : undefined}
      color="green"
    />
  )
}

// KPI Dashboard Grid
export function KPIDashboard({ analytics }: { 
  analytics: {
    totalCases: number
    activeCases: number
    caseResolutionRate: number
    averageResolutionTime: number
    totalEvidence: number
    evidenceProcessingRate: number
    activeUsers: number
    systemEfficiency: number
  }
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <TotalCasesKPI value={analytics.totalCases} />
      <ActiveCasesKPI value={analytics.activeCases} />
      <CaseResolutionRateKPI value={analytics.caseResolutionRate} />
      <AverageResolutionTimeKPI value={analytics.averageResolutionTime} />
      <TotalEvidenceKPI value={analytics.totalEvidence} />
      <EvidenceProcessingRateKPI value={analytics.evidenceProcessingRate} />
      <ActiveUsersKPI value={analytics.activeUsers} />
      <SystemEfficiencyKPI value={analytics.systemEfficiency} />
    </div>
  )
}