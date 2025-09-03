'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import {
  CSS,
} from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  File, 
  Image as ImageIcon, 
  Video, 
  Music, 
  FileText,
  Archive,
  GripVertical,
  Eye,
  Download,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

export interface EvidenceItem {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'
  size: number
  uploadDate: Date
  thumbnail?: string
  description?: string
  tags?: string[]
  caseId: string
}

interface SortableEvidenceItemProps {
  item: EvidenceItem
  isSelected: boolean
  isDragging: boolean
  onToggleSelection: (id: string, event: React.MouseEvent) => void
  onView?: (item: EvidenceItem) => void
  onDownload?: (item: EvidenceItem) => void
  onDelete?: (item: EvidenceItem) => void
}

function SortableEvidenceItem({
  item,
  isSelected,
  isDragging,
  onToggleSelection,
  onView,
  onDownload,
  onDelete,
}: SortableEvidenceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDraggedOver,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const getFileIcon = () => {
    switch (item.type) {
      case 'image':
        return <ImageIcon className="h-5 w-5" />
      case 'video':
        return <Video className="h-5 w-5" />
      case 'audio':
        return <Music className="h-5 w-5" />
      case 'document':
        return <FileText className="h-5 w-5" />
      case 'archive':
        return <Archive className="h-5 w-5" />
      default:
        return <File className="h-5 w-5" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        'group flex items-center space-x-4 p-4 bg-card rounded-lg border transition-all duration-200',
        isSelected && 'bg-primary/5 border-primary',
        isDraggedOver && 'bg-muted/50',
        'hover:shadow-md hover:border-primary/50'
      )}
      onClick={(e) => onToggleSelection(item.id, e)}
    >
      {/* Drag Handle */}
      <button
        className={cn(
          'opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing',
          'p-1 rounded hover:bg-muted'
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* File Icon/Thumbnail */}
      <div className="flex-shrink-0">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.name}
            className="h-12 w-12 rounded object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground">
            {getFileIcon()}
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-medium truncate">
            {item.name}
          </h4>
          {item.tags && item.tags.length > 0 && (
            <div className="flex space-x-1">
              {item.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full"
                >
                  {tag}
                </span>
              ))}
              {item.tags.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{item.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <span>{formatFileSize(item.size)}</span>
          <span>•</span>
          <span>{item.uploadDate.toLocaleDateString()}</span>
          <span>•</span>
          <span className="capitalize">{item.type}</span>
        </div>
        
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">
            {item.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onView?.(item)
          }}
          className="h-8 w-8"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onDownload?.(item)
          }}
          className="h-8 w-8"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.(item)
          }}
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 h-4 w-4 bg-primary rounded-full border-2 border-background"
        />
      )}
    </motion.div>
  )
}

interface SortableEvidenceListProps {
  items: EvidenceItem[]
  onReorder: (items: EvidenceItem[]) => void
  onView?: (item: EvidenceItem) => void
  onDownload?: (item: EvidenceItem) => void
  onDelete?: (item: EvidenceItem) => void
  className?: string
}

export function SortableEvidenceList({
  items,
  onReorder,
  onView,
  onDownload,
  onDelete,
  className,
}: SortableEvidenceListProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localItems, setLocalItems] = useState(items)
  
  const { 
    selectedEvidence, 
    toggleEvidenceSelection, 
    setSelectedEvidence,
    draggedEvidence,
    setDraggedEvidence 
  } = useAppStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    setActiveId(active.id as string)
    setDraggedEvidence(active.id as string)
  }, [setDraggedEvidence])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = localItems.findIndex(item => item.id === active.id)
      const newIndex = localItems.findIndex(item => item.id === over.id)
      
      const newItems = arrayMove(localItems, oldIndex, newIndex)
      setLocalItems(newItems)
      onReorder(newItems)
    }

    setActiveId(null)
    setDraggedEvidence(null)
  }, [localItems, onReorder, setDraggedEvidence])

  const handleToggleSelection = useCallback((id: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      toggleEvidenceSelection(id)
    } else if (event.shiftKey && selectedEvidence.length > 0) {
      // Range select with Shift
      const lastSelectedIndex = localItems.findIndex(item => 
        item.id === selectedEvidence[selectedEvidence.length - 1]
      )
      const currentIndex = localItems.findIndex(item => item.id === id)
      
      if (lastSelectedIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex)
        const end = Math.max(lastSelectedIndex, currentIndex)
        const rangeIds = localItems.slice(start, end + 1).map(item => item.id)
        
        setSelectedEvidence([...new Set([...selectedEvidence, ...rangeIds])])
      }
    } else {
      // Single select
      setSelectedEvidence(selectedEvidence.includes(id) ? [] : [id])
    }
  }, [selectedEvidence, toggleEvidenceSelection, setSelectedEvidence, localItems])

  // Update local items when props change
  useState(() => {
    setLocalItems(items)
  })

  const activeItem = localItems.find(item => item.id === activeId)

  return (
    <div className={cn('space-y-2', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence mode="popLayout">
            {localItems.map(item => (
              <SortableEvidenceItem
                key={item.id}
                item={item}
                isSelected={selectedEvidence.includes(item.id)}
                isDragging={item.id === activeId}
                onToggleSelection={handleToggleSelection}
                onView={onView}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        
        <DragOverlay>
          {activeItem ? (
            <div className="bg-card border rounded-lg p-4 shadow-lg opacity-90">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {activeItem.thumbnail ? (
                    <img
                      src={activeItem.thumbnail}
                      alt={activeItem.name}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground">
                      <File className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">
                    {activeItem.name}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {(activeItem.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}