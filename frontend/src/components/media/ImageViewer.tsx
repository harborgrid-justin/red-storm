'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Move, 
  Square, 
  Circle, 
  Type,
  Pen,
  ArrowRight,
  Download,
  Undo,
  Redo,
  Save,
  Eye,
  EyeOff,
  Ruler,
  MousePointer,
  Palette,
  Contrast,
  Sun,
  Settings,
  Copy,
  RotateCcw,
  FlipHorizontal,
  FlipVertical
} from 'lucide-react'

interface Point {
  x: number
  y: number
}

interface Annotation {
  id: string
  type: 'rectangle' | 'circle' | 'arrow' | 'text' | 'freehand' | 'measurement'
  points: Point[]
  text?: string
  color: string
  strokeWidth: number
  fill?: boolean
  visible: boolean
}

interface ImageAdjustments {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  gamma: number
}

interface ImageViewerProps {
  src: string
  title?: string
  annotations?: Annotation[]
  onAnnotationAdd?: (annotation: Omit<Annotation, 'id'>) => void
  onAnnotationUpdate?: (id: string, annotation: Partial<Annotation>) => void
  onAnnotationDelete?: (id: string) => void
  onExport?: (canvas: HTMLCanvasElement) => void
  className?: string
  showBeforeAfter?: boolean
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  title,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  onExport,
  className = '',
  showBeforeAfter = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [tool, setTool] = useState<'pan' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'freehand' | 'measurement'>('pan')
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentAnnotation, setCurrentAnnotation] = useState<Omit<Annotation, 'id'> | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [annotationColor, setAnnotationColor] = useState('#ff0000')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [measurements, setMeasurements] = useState<{ [id: string]: number }>({})
  const [pixelsPerUnit, setPixelsPerUnit] = useState(100) // pixels per cm/inch
  
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    gamma: 1
  })
  
  const [history, setHistory] = useState<Annotation[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 })
  const [showAdjustments, setShowAdjustments] = useState(false)

  // Load and draw image
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      canvas.width = img.width
      canvas.height = img.height
      redrawCanvas()
    }
    img.crossOrigin = 'anonymous'
    img.src = src
  }, [src])

  // Redraw canvas when annotations or adjustments change
  useEffect(() => {
    redrawCanvas()
  }, [annotations, adjustments, scale, pan])

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const img = imageRef.current
    if (!canvas || !ctx || !img) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Apply image adjustments
    ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) hue-rotate(${adjustments.hue}deg)`
    
    // Draw image
    ctx.drawImage(img, 0, 0)
    
    // Reset filter for annotations
    ctx.filter = 'none'
    
    // Draw annotations
    annotations.forEach((annotation) => {
      if (!annotation.visible) return
      
      ctx.strokeStyle = annotation.color
      ctx.lineWidth = annotation.strokeWidth
      ctx.fillStyle = annotation.fill ? annotation.color + '40' : 'transparent'
      
      switch (annotation.type) {
        case 'rectangle':
          if (annotation.points.length >= 2) {
            const [start, end] = annotation.points
            const width = end.x - start.x
            const height = end.y - start.y
            ctx.strokeRect(start.x, start.y, width, height)
            if (annotation.fill) {
              ctx.fillRect(start.x, start.y, width, height)
            }
          }
          break
          
        case 'circle':
          if (annotation.points.length >= 2) {
            const [start, end] = annotation.points
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
            ctx.beginPath()
            ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI)
            ctx.stroke()
            if (annotation.fill) {
              ctx.fill()
            }
          }
          break
          
        case 'arrow':
          if (annotation.points.length >= 2) {
            const [start, end] = annotation.points
            drawArrow(ctx, start, end)
          }
          break
          
        case 'freehand':
          if (annotation.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(annotation.points[0].x, annotation.points[0].y)
            annotation.points.slice(1).forEach(point => {
              ctx.lineTo(point.x, point.y)
            })
            ctx.stroke()
          }
          break
          
        case 'measurement':
          if (annotation.points.length >= 2) {
            const [start, end] = annotation.points
            const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
            const realDistance = distance / pixelsPerUnit
            
            // Draw line
            ctx.beginPath()
            ctx.moveTo(start.x, start.y)
            ctx.lineTo(end.x, end.y)
            ctx.stroke()
            
            // Draw measurement text
            ctx.fillStyle = annotation.color
            ctx.font = '14px Arial'
            ctx.fillText(
              `${realDistance.toFixed(1)} cm`,
              (start.x + end.x) / 2,
              (start.y + end.y) / 2 - 10
            )
          }
          break
          
        case 'text':
          if (annotation.points.length > 0 && annotation.text) {
            ctx.fillStyle = annotation.color
            ctx.font = '16px Arial'
            ctx.fillText(annotation.text, annotation.points[0].x, annotation.points[0].y)
          }
          break
      }
      
      // Highlight selected annotation
      if (selectedAnnotation === annotation.id) {
        ctx.strokeStyle = '#0066cc'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        
        if (annotation.type === 'rectangle' && annotation.points.length >= 2) {
          const [start, end] = annotation.points
          const width = end.x - start.x
          const height = end.y - start.y
          ctx.strokeRect(start.x - 2, start.y - 2, width + 4, height + 4)
        }
        
        ctx.setLineDash([])
      }
    })
  }, [annotations, adjustments, selectedAnnotation, pixelsPerUnit])

  const drawArrow = (ctx: CanvasRenderingContext2D, start: Point, end: Point) => {
    const headLength = 10
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    
    // Draw line
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    
    // Draw arrowhead
    ctx.beginPath()
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6)
    )
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6)
    )
    ctx.stroke()
  }

  const getCanvasCoordinates = useCallback((event: React.MouseEvent): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / scale - pan.x,
      y: (event.clientY - rect.top) / scale - pan.y
    }
  }, [scale, pan])

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    const point = getCanvasCoordinates(event)
    
    if (tool === 'pan') {
      setIsDragging(true)
      setDragStart(point)
    } else {
      setIsDrawing(true)
      
      const newAnnotation: Omit<Annotation, 'id'> = {
        type: tool,
        points: [point],
        color: annotationColor,
        strokeWidth,
        visible: true,
        fill: false
      }
      
      if (tool === 'text') {
        const text = prompt('Enter text:')
        if (text) {
          newAnnotation.text = text
          setCurrentAnnotation(newAnnotation)
        }
      } else {
        setCurrentAnnotation(newAnnotation)
      }
    }
  }, [tool, getCanvasCoordinates, annotationColor, strokeWidth])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    const point = getCanvasCoordinates(event)
    
    if (isDragging && tool === 'pan') {
      setPan(prevPan => ({
        x: prevPan.x + (point.x - dragStart.x),
        y: prevPan.y + (point.y - dragStart.y)
      }))
    } else if (isDrawing && currentAnnotation) {
      if (tool === 'freehand') {
        setCurrentAnnotation(prev => prev ? {
          ...prev,
          points: [...prev.points, point]
        } : null)
      } else if (tool !== 'text') {
        setCurrentAnnotation(prev => prev ? {
          ...prev,
          points: [prev.points[0], point]
        } : null)
      }
    }
  }, [isDragging, isDrawing, currentAnnotation, tool, getCanvasCoordinates, dragStart])

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
    }
    
    if (isDrawing && currentAnnotation && onAnnotationAdd) {
      onAnnotationAdd(currentAnnotation)
      setCurrentAnnotation(null)
      setIsDrawing(false)
      
      // Add to history
      const newHistory = [...annotations, { ...currentAnnotation, id: Date.now().toString() }]
      setHistory(prev => [...prev.slice(0, historyIndex + 1), newHistory])
      setHistoryIndex(prev => prev + 1)
    }
  }, [isDragging, isDrawing, currentAnnotation, onAnnotationAdd, annotations, historyIndex])

  const handleZoom = useCallback((delta: number) => {
    setScale(prevScale => Math.max(0.1, Math.min(10, prevScale + delta)))
  }, [])

  const handleAdjustmentChange = useCallback((key: keyof ImageAdjustments, value: number) => {
    setAdjustments(prev => ({
      ...prev,
      [key]: value
    }))
  }, [])

  const resetAdjustments = useCallback(() => {
    setAdjustments({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      gamma: 1
    })
  }, [])

  const exportImage = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !onExport) return
    
    onExport(canvas)
  }, [onExport])

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1)
      // Apply history state
    }
  }, [historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1)
      // Apply history state
    }
  }, [historyIndex, history.length])

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title || 'Image Evidence'}</span>
            <div className="flex items-center space-x-2">
              <Button
                variant={showBeforeAfter ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAdjustments(!showAdjustments)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Adjustments
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportImage}
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
            <div className="flex items-center space-x-1">
              {/* Tools */}
              <Button
                variant={tool === 'pan' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('pan')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'rectangle' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('rectangle')}
              >
                <Square className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'circle' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('circle')}
              >
                <Circle className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'arrow' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('arrow')}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'text' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('text')}
              >
                <Type className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'freehand' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('freehand')}
              >
                <Pen className="h-4 w-4" />
              </Button>
              
              <Button
                variant={tool === 'measurement' ? "default" : "outline"}
                size="sm"
                onClick={() => setTool('measurement')}
              >
                <Ruler className="h-4 w-4" />
              </Button>

              {/* Color picker */}
              <input
                type="color"
                value={annotationColor}
                onChange={(e) => setAnnotationColor(e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              
              {/* Stroke width */}
              <select
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="text-sm border rounded px-2 py-1"
              >
                <option value={1}>1px</option>
                <option value={2}>2px</option>
                <option value={3}>3px</option>
                <option value={5}>5px</option>
                <option value={8}>8px</option>
              </select>
            </div>

            <div className="flex items-center space-x-1">
              {/* History */}
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={historyIndex <= 0}
              >
                <Undo className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
              >
                <Redo className="h-4 w-4" />
              </Button>

              {/* Zoom controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(-0.1)}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-sm px-2">
                {Math.round(scale * 100)}%
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(0.1)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setScale(1)
                  setPan({ x: 0, y: 0 })
                }}
              >
                Reset
              </Button>
            </div>
          </div>

          {/* Canvas Container */}
          <div 
            ref={containerRef}
            className="relative bg-gray-100 rounded-lg overflow-auto border-2 border-gray-200"
            style={{ height: '500px' }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="cursor-crosshair"
              style={{
                transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: '0 0'
              }}
            />
          </div>

          {/* Image Adjustments */}
          {showAdjustments && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center">
                    <Contrast className="h-4 w-4 mr-2" />
                    Image Adjustments
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetAdjustments}
                  >
                    Reset
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Brightness: {adjustments.brightness}%
                    </label>
                    <Slider
                      value={[adjustments.brightness]}
                      onValueChange={(value) => handleAdjustmentChange('brightness', value[0])}
                      min={0}
                      max={200}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Contrast: {adjustments.contrast}%
                    </label>
                    <Slider
                      value={[adjustments.contrast]}
                      onValueChange={(value) => handleAdjustmentChange('contrast', value[0])}
                      min={0}
                      max={200}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Saturation: {adjustments.saturation}%
                    </label>
                    <Slider
                      value={[adjustments.saturation]}
                      onValueChange={(value) => handleAdjustmentChange('saturation', value[0])}
                      min={0}
                      max={200}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Hue: {adjustments.hue}°
                    </label>
                    <Slider
                      value={[adjustments.hue]}
                      onValueChange={(value) => handleAdjustmentChange('hue', value[0])}
                      min={-180}
                      max={180}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Measurement Scale (pixels per cm):
                  </label>
                  <Input
                    type="number"
                    value={pixelsPerUnit}
                    onChange={(e) => setPixelsPerUnit(Number(e.target.value))}
                    className="w-32"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annotations List */}
          {annotations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Annotations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {annotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className={`flex items-center space-x-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 ${
                        selectedAnnotation === annotation.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedAnnotation(
                        selectedAnnotation === annotation.id ? null : annotation.id
                      )}
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
                        onClick={(e) => {
                          e.stopPropagation()
                          onAnnotationUpdate?.(annotation.id, { visible: !annotation.visible })
                        }}
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

export default ImageViewer