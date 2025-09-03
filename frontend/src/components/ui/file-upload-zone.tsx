'use client'

import { useCallback, useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'

interface FileWithProgress {
  file: File
  id: string
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

interface FileUploadZoneProps {
  onFileUpload?: (files: File[]) => Promise<void>
  accept?: string
  maxFiles?: number
  maxSize?: number // in MB
  className?: string
  disabled?: boolean
}

export function FileUploadZone({
  onFileUpload,
  accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.zip,.rar,.7z',
  maxFiles = 10,
  maxSize = 100,
  className,
  disabled = false,
}: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { uploadProgress, updateUploadProgress, removeUploadProgress } = useAppStore()

  const { setNodeRef, isOver } = useDroppable({
    id: 'file-upload-zone',
    disabled,
  })

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > maxSize * 1024 * 1024) {
      return `File size exceeds ${maxSize}MB limit`
    }
    
    if (accept !== '*' && !accept.split(',').some(type => {
      const trimmed = type.trim()
      if (trimmed.startsWith('.')) {
        return file.name.toLowerCase().endsWith(trimmed.toLowerCase())
      }
      return file.type.match(new RegExp(trimmed.replace('*', '.*')))
    })) {
      return 'File type not supported'
    }
    
    return null
  }, [accept, maxSize])

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList)
    
    if (files.length + fileArray.length > maxFiles) {
      // Show error notification
      return
    }

    const validFiles: File[] = []
    const newFiles: FileWithProgress[] = []

    for (const file of fileArray) {
      const error = validateFile(file)
      const id = Math.random().toString(36).substr(2, 9)
      
      if (error) {
        newFiles.push({
          file,
          id,
          progress: 0,
          status: 'error',
          error,
        })
      } else {
        validFiles.push(file)
        newFiles.push({
          file,
          id,
          progress: 0,
          status: 'uploading',
        })
      }
    }

    setFiles(prev => [...prev, ...newFiles])

    if (validFiles.length > 0 && onFileUpload) {
      try {
        // Simulate upload progress
        for (const fileData of newFiles.filter(f => f.status === 'uploading')) {
          updateUploadProgress(fileData.id, 0)
          
          // Simulate progress
          const progressInterval = setInterval(() => {
            updateUploadProgress(fileData.id, prev => {
              const newProgress = Math.min(prev + Math.random() * 30, 95)
              return newProgress
            })
          }, 200)

          setTimeout(() => {
            clearInterval(progressInterval)
            updateUploadProgress(fileData.id, 100)
            
            setFiles(prev => prev.map(f => 
              f.id === fileData.id 
                ? { ...f, status: 'success' as const, progress: 100 }
                : f
            ))
            
            setTimeout(() => {
              removeUploadProgress(fileData.id)
            }, 1000)
          }, 2000)
        }
        
        await onFileUpload(validFiles)
      } catch (error) {
        // Handle upload error
        console.error('Upload failed:', error)
      }
    }
  }, [files.length, maxFiles, validateFile, onFileUpload, updateUploadProgress, removeUploadProgress])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setDragActive(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFiles(files)
    }
  }, [disabled, handleFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles])

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    removeUploadProgress(id)
  }, [removeUploadProgress])

  const openFileSelector = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  return (
    <div className={cn('w-full', className)}>
      <motion.div
        ref={setNodeRef}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200',
          'hover:border-primary/50 hover:bg-muted/50',
          dragActive || isOver 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        whileHover={disabled ? {} : { scale: 1.01 }}
        whileTap={disabled ? {} : { scale: 0.99 }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        
        <div className="flex flex-col items-center space-y-4">
          <motion.div
            animate={dragActive ? { scale: 1.1 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Upload className={cn(
              'h-12 w-12',
              dragActive ? 'text-primary' : 'text-muted-foreground'
            )} />
          </motion.div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium">
              {dragActive ? 'Drop files here' : 'Upload Evidence Files'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Drag and drop files or{' '}
              <button
                type="button"
                onClick={openFileSelector}
                className="text-primary hover:underline"
                disabled={disabled}
              >
                click to browse
              </button>
            </p>
            <p className="text-xs text-muted-foreground">
              Max {maxFiles} files, {maxSize}MB each
            </p>
          </div>
        </div>
      </motion.div>

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2"
          >
            {files.map((fileData) => (
              <motion.div
                key={fileData.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center space-x-3 p-3 bg-muted rounded-lg"
              >
                <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {fileData.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(fileData.file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                
                <div className="flex items-center space-x-2">
                  {fileData.status === 'uploading' && (
                    <div className="w-20">
                      <div className="h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress[fileData.id] || fileData.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {fileData.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  
                  {fileData.status === 'error' && (
                    <div className="flex items-center space-x-1">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      {fileData.error && (
                        <span className="text-xs text-destructive">
                          {fileData.error}
                        </span>
                      )}
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(fileData.id)}
                    className="h-6 w-6"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}