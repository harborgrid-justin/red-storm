'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { 
  Plus, 
  Search, 
  Filter,
  FolderOpen,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react'
import CaseService from '@/services/cases'
import { Case } from '@/types'
import { formatDate } from '@/lib/utils'

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    loadCases()
  }, [])

  const loadCases = async () => {
    try {
      setLoading(true)
      const response = await CaseService.getCases({
        limit: 50,
        search: searchTerm || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      })
      setCases(response.items)
    } catch (error) {
      console.error('Failed to load cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      OPEN: 'bg-green-100 text-green-800 border-green-200',
      CLOSED: 'bg-gray-100 text-gray-800 border-gray-200',
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      ARCHIVED: 'bg-blue-100 text-blue-800 border-blue-200',
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800 border-gray-200'
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

  const handleSearch = () => {
    loadCases()
  }

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status)
    setTimeout(loadCases, 100) // Small delay to ensure state update
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cases</h1>
            <p className="mt-2 text-gray-600">
              Manage investigation cases and track their progress
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Case
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Search & Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search cases..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilter(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                  <option value="PENDING">Pending</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <Button onClick={handleSearch}>
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cases List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading cases..." />
          </div>
        ) : (
          <div className="space-y-4">
            {cases.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderOpen className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No cases found</h3>
                  <p className="text-gray-600 text-center mb-6">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'Try adjusting your search or filters'
                      : 'Get started by creating your first case'
                    }
                  </p>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Case
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {cases.map((case_) => (
                  <Card key={case_.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <Link href={`/cases/${case_.id}`} className="block">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {case_.title}
                              </h3>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(case_.status)}`}>
                                {case_.status}
                              </span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadge(case_.priority)}`}>
                                {case_.priority}
                              </span>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-3">
                              Case #{case_.caseNumber}
                            </p>
                            
                            {case_.description && (
                              <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                                {case_.description}
                              </p>
                            )}
                            
                            <div className="flex items-center space-x-6 text-sm text-gray-500">
                              <div className="flex items-center">
                                <User className="mr-1 h-4 w-4" />
                                <span>
                                  {case_.assignedTo 
                                    ? `${case_.assignedTo.firstName} ${case_.assignedTo.lastName}`
                                    : 'Unassigned'
                                  }
                                </span>
                              </div>
                              <div className="flex items-center">
                                <Calendar className="mr-1 h-4 w-4" />
                                <span>{formatDate(case_.createdAt)}</span>
                              </div>
                              <div className="flex items-center">
                                <AlertCircle className="mr-1 h-4 w-4" />
                                <span>{case_.evidenceItems.length} evidence items</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  )
}