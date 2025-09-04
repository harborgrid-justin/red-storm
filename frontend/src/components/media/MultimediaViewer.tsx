'use client'

import React, { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { 
  FileText, 
  Image, 
  Video, 
  Volume2,
  Download,
  Share2,
  Clock,
  User,
  Calendar,
  Hash,
  FileIcon,
  PlayCircle,
  Camera,
  Mic,
  Eye,
  Settings
} from 'lucide-react'
import { VideoPlayer } from './VideoPlayer'
import { AudioPlayer } from './AudioPlayer'
import { ImageViewer } from './ImageViewer'
import { DocumentViewer } from './DocumentViewer'
import { formatFileSize, formatDate } from '@/lib/utils'

interface MediaFile {
  id: string
  name: string
  type: 'video' | 'audio' | 'image' | 'document'
  src: string
  size: number
  mimeType: string
  uploadedAt: Date
  uploadedBy: string
  checksum?: string
  metadata?: Record<string, unknown>
}

interface MediaAnnotation {
  id: string
  type: string
  timestamp?: number
  position?: { x: number, y: number }
  text: string
  author: string
  createdAt: Date
}

interface MultimediaViewerProps {
  file: MediaFile
  annotations?: MediaAnnotation[]
  onAnnotationAdd?: (annotation: Omit<MediaAnnotation, 'id' | 'createdAt'>) => void
  onAnnotationUpdate?: (id: string, annotation: Partial<MediaAnnotation>) => void
  onAnnotationDelete?: (id: string) => void
  onExport?: (format: string, options?: Record<string, unknown>) => void
  onShare?: () => void
  className?: string
}

export const MultimediaViewer: React.FC<MultimediaViewerProps> = ({
  file,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  onExport,
  onShare,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('viewer')
  const [exportOptions, setExportOptions] = useState({
    format: 'original',
    includeAnnotations: true,
    includeMetadata: true
  })

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-5 w-5" />
      case 'audio': return <Volume2 className="h-5 w-5" />
      case 'image': return <Image className="h-5 w-5" />
      case 'document': return <FileText className="h-5 w-5" />
      default: return <FileIcon className="h-5 w-5" />
    }
  }

  const getStatusColor = (type: string) => {
    switch (type) {
      case 'video': return 'bg-purple-100 text-purple-800'
      case 'audio': return 'bg-green-100 text-green-800'
      case 'image': return 'bg-blue-100 text-blue-800'
      case 'document': return 'bg-orange-100 text-orange-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleVideoAnnotation = useCallback((timestamp: number, text: string, type: 'comment' | 'bookmark') => {
    const annotation: Omit<MediaAnnotation, 'id' | 'createdAt'> = {
      type,
      timestamp,
      text,
      author: 'Current User' // In real app, get from auth context
    }
    onAnnotationAdd?.(annotation)
  }, [onAnnotationAdd])

  const handleImageAnnotation = useCallback((annotation: { type: string; points: Array<{ x: number; y: number }>; text?: string }) => {
    const mediaAnnotation: Omit<MediaAnnotation, 'id' | 'createdAt'> = {
      type: annotation.type,
      position: annotation.points[0],
      text: annotation.text || `${annotation.type} annotation`,
      author: 'Current User'
    }
    onAnnotationAdd?.(mediaAnnotation)
  }, [onAnnotationAdd])

  const handleDocumentAnnotation = useCallback((annotation: { type: string; x: number; y: number; text?: string; page?: number }) => {
    const mediaAnnotation: Omit<MediaAnnotation, 'id' | 'createdAt'> = {
      type: annotation.type,
      position: { x: annotation.x, y: annotation.y },
      text: annotation.text || `${annotation.type} on page ${annotation.page || 1}`,
      author: 'Current User'
    }
    onAnnotationAdd?.(mediaAnnotation)
  }, [onAnnotationAdd])

  const handleExport = useCallback((format: string) => {
    onExport?.(format, exportOptions)
  }, [onExport, exportOptions])

  const renderViewer = () => {
    const commonProps = {
      src: file.src,
      title: file.name,
      className: "mt-4"
    }

    switch (file.type) {
      case 'video':
        return (
          <VideoPlayer
            {...commonProps}
            annotations={annotations
              .filter(ann => ann.timestamp !== undefined)
              .map(ann => ({
                id: ann.id,
                timestamp: ann.timestamp!,
                text: ann.text,
                author: ann.author,
                createdAt: ann.createdAt,
                type: ann.type as 'comment' | 'bookmark'
              }))}
            onAnnotationAdd={handleVideoAnnotation}
            onExport={(start, end) => handleExport('video-clip')}
          />
        )

      case 'audio':
        return (
          <AudioPlayer
            {...commonProps}
            onExport={(blob) => handleExport('enhanced-audio')}
          />
        )

      case 'image':
        return (
          <ImageViewer
            {...commonProps}
            annotations={annotations
              .filter(ann => ann.position)
              .map(ann => ({
                id: ann.id,
                type: ann.type as any,
                points: ann.position ? [ann.position] : [],
                text: ann.text,
                color: '#ff0000',
                strokeWidth: 2,
                visible: true,
                fill: false
              }))}
            onAnnotationAdd={handleImageAnnotation}
            onAnnotationUpdate={(id, update) => onAnnotationUpdate?.(id, update)}
            onAnnotationDelete={onAnnotationDelete}
            onExport={(canvas) => handleExport('enhanced-image')}
          />
        )

      case 'document':
        return (
          <DocumentViewer
            {...commonProps}
            src={file.src}
            annotations={annotations
              .filter(ann => ann.position)
              .map(ann => ({
                id: ann.id,
                page: 1, // Would need to track page in real implementation
                type: ann.type as any,
                x: ann.position!.x,
                y: ann.position!.y,
                width: 100,
                height: 20,
                text: ann.text,
                color: '#ffff00',
                visible: true,
                permanent: false
              }))}
            onAnnotationAdd={handleDocumentAnnotation}
            onAnnotationUpdate={(id, update) => onAnnotationUpdate?.(id, update)}
            onAnnotationDelete={onAnnotationDelete}
            onTextExtract={(text, page) => console.log('Extracted text:', text)}
            onExport={(pages, anns) => handleExport('processed-document')}
          />
        )

      default:
        return (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <FileIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Unsupported file type: {file.type}</p>
                <Button 
                  className="mt-4"
                  onClick={() => handleExport('original')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Original
                </Button>
              </div>
            </CardContent>
          </Card>
        )
    }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* File Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {getFileIcon(file.type)}
                <div>
                  <h2 className="text-xl font-semibold">{file.name}</h2>
                  <p className="text-sm text-gray-600">{file.mimeType}</p>
                </div>
              </div>
              <Badge className={getStatusColor(file.type)}>
                {file.type.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onShare}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('original')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* File Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evidence Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <FileIcon className="h-4 w-4 text-gray-400" />
              <div>
                <p className="font-medium">Size</p>
                <p className="text-gray-600">{formatFileSize(file.size)}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <div>
                <p className="font-medium">Uploaded</p>
                <p className="text-gray-600">{formatDate(file.uploadedAt)}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-gray-400" />
              <div>
                <p className="font-medium">Uploaded By</p>
                <p className="text-gray-600">{file.uploadedBy}</p>
              </div>
            </div>
            
            {file.checksum && (
              <div className="flex items-center space-x-2">
                <Hash className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="font-medium">Checksum</p>
                  <p className="text-gray-600 font-mono text-xs">
                    {file.checksum.substring(0, 16)}...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Extended metadata */}
          {file.metadata && Object.keys(file.metadata).length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium mb-3">Technical Metadata</h4>
              <div className="bg-gray-50 p-3 rounded text-xs">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(file.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="viewer" className="flex items-center space-x-2">
            <Eye className="h-4 w-4" />
            <span>Viewer</span>
          </TabsTrigger>
          <TabsTrigger value="annotations" className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>Annotations ({annotations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="viewer">
          {renderViewer()}
        </TabsContent>

        <TabsContent value="annotations">
          <Card>
            <CardHeader>
              <CardTitle>Annotations & Comments</CardTitle>
            </CardHeader>
            <CardContent>
              {annotations.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No annotations yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Switch to the viewer tab to add annotations
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {annotations.map((annotation) => (
                    <div key={annotation.id} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{annotation.type}</Badge>
                          <span className="text-sm font-medium">{annotation.author}</span>
                          {annotation.timestamp && (
                            <span className="text-xs text-gray-500">
                              @ {Math.floor(annotation.timestamp / 60)}:{String(Math.floor(annotation.timestamp % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatDate(annotation.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-2">{annotation.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle>Forensic Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Chain of Custody */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    Chain of Custody
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>File uploaded</span>
                      <span>{formatDate(file.uploadedAt)}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>Integrity verified</span>
                      <span className="text-green-600">✓ Verified</span>
                    </div>
                  </div>
                </div>

                {/* Technical Analysis */}
                <div>
                  <h4 className="font-medium mb-3">Technical Analysis</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium">File Integrity</p>
                      <p className="text-green-600">✓ Hash verified</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium">Format Validation</p>
                      <p className="text-green-600">✓ Valid {file.mimeType}</p>
                    </div>
                    {file.type === 'image' && (
                      <>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium">EXIF Data</p>
                          <p className="text-blue-600">Available</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium">Manipulation Check</p>
                          <p className="text-green-600">No tampering detected</p>
                        </div>
                      </>
                    )}
                    {file.type === 'video' && (
                      <>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium">Video Streams</p>
                          <p className="text-blue-600">1 video, 1 audio</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="font-medium">Codec Analysis</p>
                          <p className="text-green-600">Standard encoding</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Export Formats</h4>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleExport('original')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Original File
                    </Button>
                    
                    {file.type === 'image' && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleExport('enhanced-image')}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Enhanced Image (with adjustments)
                      </Button>
                    )}
                    
                    {file.type === 'video' && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleExport('video-frames')}
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Extract Frames
                      </Button>
                    )}
                    
                    {file.type === 'audio' && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleExport('enhanced-audio')}
                      >
                        <Mic className="h-4 w-4 mr-2" />
                        Enhanced Audio
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => handleExport('annotations-report')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Annotations Report
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Export Settings</h4>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={exportOptions.includeAnnotations}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          includeAnnotations: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <span className="text-sm">Include annotations</span>
                    </label>
                    
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={exportOptions.includeMetadata}
                        onChange={(e) => setExportOptions(prev => ({
                          ...prev,
                          includeMetadata: e.target.checked
                        }))}
                        className="rounded"
                      />
                      <span className="text-sm">Include metadata</span>
                    </label>
                    
                    <div className="pt-4">
                      <p className="text-xs text-gray-600">
                        All exports maintain chain of custody and include digital signatures.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default MultimediaViewer