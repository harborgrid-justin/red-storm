'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { MainLayout } from '@/components/layout/main-layout'
import { FileUploadZone } from '@/components/ui/file-upload-zone'
import { SortableEvidenceList, EvidenceItem } from '@/components/ui/sortable-evidence-list'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PageTransition, listVariants, listItemVariants } from '@/components/ui/page-transition'
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
  HardDrive,
  Settings,
  Trash2,
  ChevronDown,
  Grid,
  List,
  SortAsc,
  SortDesc,
} from 'lucide-react'
import EvidenceService from '@/services/evidence'
import { formatDate, formatFileSize } from '@/lib/utils'
import { useAppStore, useNotificationStore } from '@/stores/app-store'
import toast from 'react-hot-toast'

// Mock evidence data for demonstration
const createMockEvidence = (): EvidenceItem[] => [
  {
    id: '1',
    name: 'Crime Scene Photo 1.jpg',
    type: 'image',
    size: 2548736,
    uploadDate: new Date('2024-01-15'),
    thumbnail: 'https://picsum.photos/200/200?random=1',
    description: 'Primary crime scene photograph showing entry point',
    tags: ['Crime Scene', 'Primary', 'Photos'],
    caseId: 'case-001',
  },
  {
    id: '2', 
    name: 'Security Camera Footage.mp4',
    type: 'video',
    size: 45678901,
    uploadDate: new Date('2024-01-14'),
    description: 'Security camera footage from building entrance',
    tags: ['Security', 'Video', 'Entrance'],
    caseId: 'case-001',
  },
  {
    id: '3',
    name: 'Suspect Interview Audio.wav',
    type: 'audio',
    size: 12345678,
    uploadDate: new Date('2024-01-16'),
    description: 'Audio recording of suspect interview session',
    tags: ['Interview', 'Suspect', 'Audio'],
    caseId: 'case-001',
  },
  {
    id: '4',
    name: 'Financial Records.pdf',
    type: 'document',
    size: 987654,
    uploadDate: new Date('2024-01-13'),
    description: 'Bank statements and financial transaction records',
    tags: ['Financial', 'Documents', 'Analysis'],
    caseId: 'case-001',
  },
]

export default function EvidencePage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  
  const queryClient = useQueryClient()
  const { 
    selectedEvidence, 
    clearEvidenceSelection,
    sortBy,
    sortOrder,
    setSorting,
    itemsPerPage,
  } = useAppStore()
  const { addNotification } = useNotificationStore()

  // Use TanStack Query for server state management
  const { data: evidence = [], isLoading, error } = useQuery({
    queryKey: ['evidence', { search: searchTerm, type: typeFilter, status: statusFilter }],
    queryFn: async () => {
      try {
        // In real implementation, this would call the API
        // const response = await EvidenceService.getEvidenceItems({
        //   limit: itemsPerPage,
        //   search: searchTerm || undefined,
        //   type: typeFilter !== 'all' ? typeFilter : undefined,
        //   status: statusFilter !== 'all' ? statusFilter : undefined
        // })
        // return response.items
        
        // For demo, return mock data with filtering
        let filtered = createMockEvidence()
        
        if (searchTerm) {
          filtered = filtered.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        }
        
        if (typeFilter !== 'all') {
          filtered = filtered.filter(item => item.type === typeFilter)
        }
        
        return filtered
      } catch (err) {
        console.error('Failed to load evidence:', err)
        throw err
      }
    },
    refetchOnWindowFocus: false,
  })

  // File upload mutation
  const uploadFilesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // In real implementation:
      // return await EvidenceService.uploadFiles(files)
      
      return files.map(file => ({
        id: Math.random().toString(36),
        name: file.name,
        size: file.size,
        success: true,
      }))
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] })
      addNotification({
        type: 'success',
        title: 'Upload Complete',
        message: `Successfully uploaded ${results.length} file(s)`,
      })
      toast.success(`Successfully uploaded ${results.length} file(s)`)
      setUploadDialogOpen(false)
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Upload Failed',
        message: 'Failed to upload files. Please try again.',
      })
      toast.error('Failed to upload files')
      console.error('Upload failed:', error)
    },
  })

  const handleFileUpload = useCallback(async (files: File[]) => {
    uploadFilesMutation.mutate(files)
  }, [uploadFilesMutation])

  const handleSearch = useCallback(() => {
    // Query will automatically refetch due to dependency on searchTerm
  }, [])

  const handleReorderEvidence = useCallback((reorderedItems: EvidenceItem[]) => {
    // In real implementation, persist the order to the backend
    console.log('Reordering evidence:', reorderedItems)
    addNotification({
      type: 'info',
      title: 'Evidence Reordered',
      message: 'Evidence order has been updated',
    })
  }, [addNotification])

  const handleViewEvidence = useCallback((item: EvidenceItem) => {
    console.log('Viewing evidence:', item)
    addNotification({
      type: 'info',
      title: 'Opening Evidence',
      message: `Opening ${item.name}`,
    })
  }, [addNotification])

  const handleDownloadEvidence = useCallback((item: EvidenceItem) => {
    console.log('Downloading evidence:', item)
    addNotification({
      type: 'info',
      title: 'Download Started',
      message: `Downloading ${item.name}`,
    })
  }, [addNotification])

  const handleDeleteEvidence = useCallback((item: EvidenceItem) => {
    console.log('Deleting evidence:', item)
    // In real implementation, show confirmation dialog and delete
    addNotification({
      type: 'warning',
      title: 'Evidence Deletion',
      message: `This would delete ${item.name}`,
    })
  }, [addNotification])

  const handleBulkAction = useCallback((action: string) => {
    if (selectedEvidence.length === 0) {
      toast.error('Please select evidence items first')
      return
    }

    console.log(`Bulk ${action} on:`, selectedEvidence)
    addNotification({
      type: 'info',
      title: `Bulk ${action}`,
      message: `${action} ${selectedEvidence.length} evidence item(s)`,
    })
    
    // Clear selection after action
    setTimeout(() => clearEvidenceSelection(), 1000)
  }, [selectedEvidence, addNotification, clearEvidenceSelection])

  const toggleSort = useCallback(() => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    setSorting(sortBy, newOrder)
  }, [sortBy, sortOrder, setSorting])

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Failed to load evidence</h2>
            <p className="text-gray-600 mt-2">Please try refreshing the page</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Refresh
            </Button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageTransition>
        <motion.div 
          className="space-y-6"
          variants={listVariants}
          initial="initial"
          animate="animate"
        >
          {/* Header */}
          <motion.div 
            variants={listItemVariants}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Evidence Management</h1>
              <p className="mt-2 text-gray-600">
                Phase 3: Advanced drag-drop interface with real-time updates
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Upload Evidence Files</DialogTitle>
                  </DialogHeader>
                  <FileUploadZone 
                    onFileUpload={handleFileUpload}
                    maxFiles={20}
                    maxSize={500}
                    className="mt-4"
                  />
                </DialogContent>
              </Dialog>
              
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Evidence
              </Button>
            </div>
          </motion.div>

          {/* Search and Filters */}
          <motion.div variants={listItemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Search & Filter Evidence</span>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Search
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search evidence by name or description..."
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
                      <option value="image">Images</option>
                      <option value="video">Videos</option>
                      <option value="audio">Audio</option>
                      <option value="document">Documents</option>
                      <option value="archive">Archives</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sort
                    </label>
                    <Button
                      variant="outline"
                      onClick={toggleSort}
                      className="w-full justify-between"
                    >
                      <span>{sortBy}</span>
                      {sortOrder === 'asc' ? (
                        <SortAsc className="h-4 w-4" />
                      ) : (
                        <SortDesc className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  
                  <Button onClick={handleSearch}>
                    <Search className="mr-2 h-4 w-4" />
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Selection Actions */}
          {selectedEvidence.length > 0 && (
            <motion.div 
              variants={listItemVariants}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-primary">
                      {selectedEvidence.length} item(s) selected
                    </span>
                    <div className="flex items-center space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleBulkAction('Download')}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleBulkAction('Export')}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Export
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleBulkAction('Archive')}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Archive
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => handleBulkAction('Delete')}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={clearEvidenceSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Evidence List */}
          <motion.div variants={listItemVariants}>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" text="Loading evidence with Phase 3 enhancements..." />
              </div>
            ) : evidence.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No evidence found</h3>
                  <p className="text-gray-600 text-center mb-6">
                    {searchTerm || typeFilter !== 'all' 
                      ? 'Try adjusting your search or filters'
                      : 'Get started by uploading evidence files using the drag-and-drop interface'
                    }
                  </p>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
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
              <SortableEvidenceList
                items={evidence}
                onReorder={handleReorderEvidence}
                onView={handleViewEvidence}
                onDownload={handleDownloadEvidence}
                onDelete={handleDeleteEvidence}
              />
            )}
          </motion.div>

          {/* Phase 3 Features Demo */}
          <motion.div variants={listItemVariants}>
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-900">Phase 3 Features Demonstrated</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">✅ Implemented:</h4>
                    <ul className="space-y-1 text-xs">
                      <li>• Next.js 15 with App Router & TypeScript</li>
                      <li>• TanStack Query for server state management</li>
                      <li>• Zustand for client-side state management</li>
                      <li>• Radix UI primitives with Tailwind styling</li>
                      <li>• Framer Motion animations & page transitions</li>
                      <li>• @dnd-kit drag-and-drop with accessibility</li>
                      <li>• File upload zones with progress indicators</li>
                      <li>• Multi-select with keyboard shortcuts</li>
                      <li>• Touch support for mobile devices</li>
                      <li>• Middleware for security & request logging</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">🔄 Try These Interactions:</h4>
                    <ul className="space-y-1 text-xs">
                      <li>• Drag evidence items to reorder them</li>
                      <li>• Ctrl+Click to multi-select evidence</li>
                      <li>• Upload files via drag-and-drop</li>
                      <li>• Watch real-time progress indicators</li>
                      <li>• Notice page transition animations</li>
                      <li>• Use search with instant filtering</li>
                      <li>• Check browser console for actions</li>
                      <li>• View notifications in top-right corner</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </PageTransition>
    </MainLayout>
  )
}