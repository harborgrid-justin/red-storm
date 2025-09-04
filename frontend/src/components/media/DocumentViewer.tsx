'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Download,
  Search,
  FileText,
  Highlighter,
  MessageSquare,
  Eye,
  EyeOff,
  Copy,
  RotateCw,
  Settings,
  Scissors,
  Save,
  ScanLine,
  FileSearch,
  Layers
} from 'lucide-react'

interface DocumentAnnotation {
  id: string
  page: number
  type: 'highlight' | 'comment' | 'redaction'
  x: number
  y: number
  width: number
  height: number
  text?: string
  color: string
  visible: boolean
  permanent: boolean
}

interface OCRResult {
  text: string
  confidence: number
  words: Array<{
    text: string
    bbox: [number, number, number, number]
    confidence: number
  }>
}

interface DocumentViewerProps {
  src: string | ArrayBuffer
  title?: string
  annotations?: DocumentAnnotation[]
  onAnnotationAdd?: (annotation: Omit<DocumentAnnotation, 'id'>) => void
  onAnnotationUpdate?: (id: string, annotation: Partial<DocumentAnnotation>) => void
  onAnnotationDelete?: (id: string) => void
  onTextExtract?: (text: string, page: number) => void
  onExport?: (pages: number[], annotations: DocumentAnnotation[]) => void
  className?: string
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  src,
  title,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  onTextExtract,
  onExport,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{
    page: number
    matches: Array<{ text: string, x: number, y: number }>
  }>>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  
  const [tool, setTool] = useState<'select' | 'highlight' | 'comment' | 'redact'>('select')
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null)
  const [currentSelection, setCurrentSelection] = useState<DocumentAnnotation | null>(null)
  
  const [extractedText, setExtractedText] = useState<{ [page: number]: string }>({})
  const [ocrResults, setOCRResults] = useState<{ [page: number]: OCRResult }>({})
  const [isProcessingOCR, setIsProcessingOCR] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [showRedactions, setShowRedactions] = useState(true)

  // Mock PDF.js implementation
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [currentPageData, setCurrentPageData] = useState<any>(null)

  // Load PDF document
  useEffect(() => {
    const loadDocument = async () => {
      try {
        // In a real implementation, you would use PDF.js here:
        // const pdfjsLib = await import('pdfjs-dist')
        // const pdf = await pdfjsLib.getDocument(src).promise
        // setPdfDocument(pdf)
        // setTotalPages(pdf.numPages)
        
        // Mock implementation
        const mockPdf = {
          numPages: 5,
          getPage: async (pageNum: number) => ({
            pageNumber: pageNum,
            getViewport: (params: any) => ({
              width: 612 * params.scale,
              height: 792 * params.scale,
              transform: [params.scale, 0, 0, params.scale, 0, 0]
            }),
            render: (params: any) => ({
              promise: Promise.resolve()
            }),
            getTextContent: async () => ({
              items: [
                {
                  str: `Sample text content for page ${pageNum}`,
                  transform: [1, 0, 0, 1, 100, 700],
                  width: 200,
                  height: 12
                }
              ]
            })
          })
        }
        
        setPdfDocument(mockPdf)
        setTotalPages(mockPdf.numPages)
      } catch (error) {
        console.error('Failed to load PDF:', error)
      }
    }

    if (src) {
      loadDocument()
    }
  }, [src])

  // Render current page
  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(currentPage)
        const viewport = page.getViewport({ scale, rotation })
        
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        
        canvas.width = viewport.width
        canvas.height = viewport.height
        
        // In a real implementation:
        // await page.render({
        //   canvasContext: ctx,
        //   viewport: viewport
        // }).promise

        // Mock rendering - draw a simple page representation
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, viewport.width, viewport.height)
        
        ctx.fillStyle = 'black'
        ctx.font = '12px Arial'
        ctx.fillText(`Page ${currentPage}`, 50, 50)
        ctx.fillText('Sample document content...', 50, 100)
        
        // Extract text content
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(' ')
        setExtractedText(prev => ({ ...prev, [currentPage]: pageText }))
        
        setCurrentPageData(page)
        
        // Render annotations
        renderAnnotations()
      } catch (error) {
        console.error('Failed to render page:', error)
      }
    }

    renderPage()
  }, [pdfDocument, currentPage, scale, rotation])

  const renderAnnotations = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const pageAnnotations = annotations.filter(ann => ann.page === currentPage)
    
    pageAnnotations.forEach((annotation) => {
      if (!annotation.visible) return
      
      ctx.save()
      
      switch (annotation.type) {
        case 'highlight':
          ctx.fillStyle = annotation.color + '40' // Semi-transparent
          ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height)
          break
          
        case 'redaction':
          if (showRedactions) {
            ctx.fillStyle = annotation.permanent ? '#000000' : '#ff000080'
            ctx.fillRect(annotation.x, annotation.y, annotation.width, annotation.height)
            
            if (!annotation.permanent) {
              ctx.fillStyle = 'white'
              ctx.font = '10px Arial'
              ctx.fillText('REDACTED', annotation.x + 5, annotation.y + annotation.height / 2)
            }
          }
          break
          
        case 'comment':
          ctx.strokeStyle = annotation.color
          ctx.lineWidth = 2
          ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height)
          
          // Draw comment icon
          ctx.fillStyle = annotation.color
          ctx.beginPath()
          ctx.arc(annotation.x + annotation.width + 10, annotation.y + 10, 8, 0, Math.PI * 2)
          ctx.fill()
          
          ctx.fillStyle = 'white'
          ctx.font = '10px Arial'
          ctx.fillText('?', annotation.x + annotation.width + 7, annotation.y + 14)
          break
      }
      
      ctx.restore()
    })
  }, [annotations, currentPage, showAnnotations, showRedactions])

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (tool === 'select') return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    setIsSelecting(true)
    setSelectionStart({ x, y })
  }, [tool])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isSelecting || !selectionStart) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    const annotation: DocumentAnnotation = {
      id: Date.now().toString(),
      page: currentPage,
      type: tool as 'highlight' | 'comment' | 'redaction',
      x: Math.min(selectionStart.x, x),
      y: Math.min(selectionStart.y, y),
      width: Math.abs(x - selectionStart.x),
      height: Math.abs(y - selectionStart.y),
      color: tool === 'highlight' ? '#ffff00' : tool === 'comment' ? '#0066cc' : '#ff0000',
      visible: true,
      permanent: false
    }
    
    setCurrentSelection(annotation)
  }, [isSelecting, selectionStart, currentPage, tool])

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !currentSelection) return
    
    if (currentSelection.width > 5 && currentSelection.height > 5) {
      if (currentSelection.type === 'comment') {
        const text = prompt('Enter comment:')
        if (text) {
          const finalAnnotation = { ...currentSelection, text }
          onAnnotationAdd?.(finalAnnotation)
        }
      } else {
        onAnnotationAdd?.(currentSelection)
      }
    }
    
    setIsSelecting(false)
    setSelectionStart(null)
    setCurrentSelection(null)
  }, [isSelecting, currentSelection, onAnnotationAdd])

  const performOCR = useCallback(async () => {
    setIsProcessingOCR(true)
    
    try {
      // In a real implementation, you would use Tesseract.js:
      // const { createWorker } = await import('tesseract.js')
      // const worker = await createWorker()
      // await worker.loadLanguage('eng')
      // await worker.initialize('eng')
      // const { data } = await worker.recognize(canvas)
      // await worker.terminate()
      
      // Mock OCR results
      const mockOCR: OCRResult = {
        text: extractedText[currentPage] || `OCR text for page ${currentPage}`,
        confidence: 85,
        words: [
          {
            text: 'Sample',
            bbox: [50, 50, 100, 65],
            confidence: 90
          },
          {
            text: 'OCR',
            bbox: [110, 50, 140, 65],
            confidence: 80
          }
        ]
      }
      
      setOCRResults(prev => ({ ...prev, [currentPage]: mockOCR }))
      onTextExtract?.(mockOCR.text, currentPage)
    } catch (error) {
      console.error('OCR failed:', error)
    } finally {
      setIsProcessingOCR(false)
    }
  }, [currentPage, extractedText, onTextExtract])

  const performSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      setSearchResults([])
      return
    }

    const results: Array<{
      page: number
      matches: Array<{ text: string, x: number, y: number }>
    }> = []

    Object.entries(extractedText).forEach(([pageStr, text]) => {
      const page = parseInt(pageStr)
      const regex = new RegExp(searchTerm, 'gi')
      const matches = []
      let match

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          text: match[0],
          x: 100 + match.index * 5, // Mock positioning
          y: 100 + matches.length * 20
        })
      }

      if (matches.length > 0) {
        results.push({ page, matches })
      }
    })

    setSearchResults(results)
    setCurrentSearchIndex(0)
  }, [searchTerm, extractedText])

  const goToSearchResult = useCallback((index: number) => {
    if (searchResults.length === 0) return
    
    const result = searchResults[index]
    if (result) {
      setCurrentPage(result.page)
      setCurrentSearchIndex(index)
    }
  }, [searchResults])

  const exportDocument = useCallback(() => {
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    onExport?.(pages, annotations)
  }, [totalPages, annotations, onExport])

  const toggleAnnotationVisibility = useCallback((id: string) => {
    const annotation = annotations.find(ann => ann.id === id)
    if (annotation) {
      onAnnotationUpdate?.(id, { visible: !annotation.visible })
    }
  }, [annotations, onAnnotationUpdate])

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title || 'Document Evidence'}</span>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={performOCR}
                disabled={isProcessingOCR}
              >
                <ScanLine className="h-4 w-4 mr-2" />
                {isProcessingOCR ? 'Processing...' : 'OCR'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnnotations(!showAnnotations)}
              >
                <Layers className="h-4 w-4 mr-2" />
                Annotations
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportDocument}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              {/* Page navigation */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="text-sm px-2">
                Page {currentPage} of {totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              {/* Zoom controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-sm px-2">
                {Math.round(scale * 100)}%
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(Math.min(3, scale + 0.1))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setRotation((rotation + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              {/* Annotation tools */}
              <Button
                variant={tool === 'select' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('select')}
              >
                Select
              </Button>
              
              <Button
                variant={tool === 'highlight' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('highlight')}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'comment' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('comment')}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'redact' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('redact')}
              >
                <Scissors className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search in document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={performSearch}>
              <FileSearch className="h-4 w-4" />
            </Button>
            
            {searchResults.length > 0 && (
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToSearchResult(Math.max(0, currentSearchIndex - 1))}
                  disabled={currentSearchIndex <= 0}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs px-2">
                  {currentSearchIndex + 1} of {searchResults.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToSearchResult(Math.min(searchResults.length - 1, currentSearchIndex + 1))}
                  disabled={currentSearchIndex >= searchResults.length - 1}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Document Canvas */}
          <div 
            ref={containerRef}
            className="relative bg-gray-200 rounded-lg overflow-auto border-2 border-gray-300"
            style={{ height: '600px' }}
          >
            <div className="flex justify-center p-4">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="shadow-lg bg-white cursor-crosshair max-w-full"
                style={{
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center'
                }}
              />
            </div>

            {/* Current selection overlay */}
            {currentSelection && (
              <div
                className="absolute border-2 border-dashed border-blue-500 bg-blue-200 bg-opacity-30 pointer-events-none"
                style={{
                  left: currentSelection.x,
                  top: currentSelection.y,
                  width: currentSelection.width,
                  height: currentSelection.height
                }}
              />
            )}
          </div>

          {/* OCR Results */}
          {ocrResults[currentPage] && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-sm">
                  OCR Results (Confidence: {ocrResults[currentPage].confidence}%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm bg-white p-3 rounded border max-h-32 overflow-y-auto">
                  {ocrResults[currentPage].text}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annotations List */}
          {annotations.filter(ann => ann.page === currentPage).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Page {currentPage} Annotations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {annotations.filter(ann => ann.page === currentPage).map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-center space-x-2 p-2 bg-gray-50 rounded"
                    >
                      <div 
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <span className="text-sm flex-1">
                        {annotation.type} {annotation.text && `- ${annotation.text}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAnnotationVisibility(annotation.id)}
                      >
                        {annotation.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default DocumentViewer