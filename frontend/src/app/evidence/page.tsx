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
  FileText,
  Upload,
  Download,
  Eye,
  User,
  Calendar,
  Hash,
  HardDrive
} from 'lucide-react'
import EvidenceService from '@/services/evidence'
import { EvidenceItem } from '@/types'
import { formatDate, formatFileSize } from '@/lib/utils'

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    loadEvidence()
  }, [])

  const loadEvidence = async () => {
    try {
      setLoading(true)
      const response = await EvidenceService.getEvidenceItems({
        limit: 50,
        search: searchTerm || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      })
      setEvidence(response.items)
    } catch (error) {
      console.error('Failed to load evidence:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      COLLECTED: 'bg-green-100 text-green-800 border-green-200',
      PROCESSING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      ANALYZED: 'bg-blue-100 text-blue-800 border-blue-200',
      STORED: 'bg-gray-100 text-gray-800 border-gray-200',
      ARCHIVED: 'bg-purple-100 text-purple-800 border-purple-200',
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getTypeIcon = (type: string) => {
    const icons = {
      PHOTO: '📷',
      VIDEO: '🎥',
      AUDIO: '🎵',
      DOCUMENT: '📄',
      PHYSICAL: '📦',
      DIGITAL: '💾',
    }
    return icons[type as keyof typeof icons] || '📄'
  }

  const handleSearch = () => {
    loadEvidence()
  }

  const handleFilter = () => {
    loadEvidence()
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Evidence</h1>
            <p className="mt-2 text-gray-600">
              Manage digital and physical evidence items with secure chain of custody
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Evidence
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Search & Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search evidence..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="PHOTO">Photo</option>
                  <option value="VIDEO">Video</option>
                  <option value="AUDIO">Audio</option>
                  <option value="DOCUMENT">Document</option>
                  <option value="PHYSICAL">Physical</option>
                  <option value="DIGITAL">Digital</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="COLLECTED">Collected</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="ANALYZED">Analyzed</option>
                  <option value="STORED">Stored</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              
              <Button onClick={handleFilter}>
                <Filter className="mr-2 h-4 w-4" />
                Apply Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Evidence List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading evidence..." />
          </div>
        ) : (
          <div className="space-y-4">
            {evidence.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No evidence found</h3>
                  <p className="text-gray-600 text-center mb-6">
                    {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Get started by adding your first evidence item'
                    }
                  </p>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Files
                    </Button>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Evidence
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {evidence.map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <span className="text-2xl">{getTypeIcon(item.type)}</span>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {item.title}
                            </h3>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(item.status)}`}>
                              {item.status}
                            </span>
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-3">
                            Item #{item.itemNumber}
                          </p>
                          
                          {item.description && (
                            <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500 mb-4">
                            <div className="flex items-center">
                              <User className="mr-1 h-4 w-4" />
                              <span>
                                {item.collectedBy 
                                  ? `${item.collectedBy.firstName} ${item.collectedBy.lastName}`
                                  : 'Unknown'
                                }
                              </span>
                            </div>
                            <div className="flex items-center">
                              <Calendar className="mr-1 h-4 w-4" />
                              <span>{formatDate(item.collectedAt)}</span>
                            </div>
                            {item.filename && (
                              <>
                                <div className="flex items-center">
                                  <HardDrive className="mr-1 h-4 w-4" />
                                  <span>{item.size ? formatFileSize(item.size) : 'Unknown size'}</span>
                                </div>
                                <div className="flex items-center">
                                  <Hash className="mr-1 h-4 w-4" />
                                  <span className="font-mono text-xs">
                                    {item.hash ? item.hash.substring(0, 8) + '...' : 'No hash'}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {item.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-start space-x-2 ml-4">
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {item.filename && (
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Chain of custody preview */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">
                            Chain of Custody: {item.chainOfCustody?.length || 0} entries
                          </span>
                          <Link 
                            href={`/evidence/${item.id}`}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            View Details →
                          </Link>
                        </div>
                      </div>
                    </CardContent>
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