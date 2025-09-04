'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  SkipBack, 
  SkipForward, 
  Maximize, 
  Settings,
  MessageSquare,
  Bookmark,
  Download,
  Repeat,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { formatTime } from '@/lib/utils'

interface VideoAnnotation {
  id: string
  timestamp: number
  text: string
  author: string
  createdAt: Date
  type: 'comment' | 'bookmark'
}

interface VideoPlayerProps {
  src: string
  title?: string
  subtitles?: string // WebVTT subtitle file URL
  annotations?: VideoAnnotation[]
  onAnnotationAdd?: (timestamp: number, text: string, type: 'comment' | 'bookmark') => void
  onExport?: (startTime: number, endTime: number) => void
  className?: string
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title,
  subtitles,
  annotations = [],
  onAnnotationAdd,
  onExport,
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isLooping, setIsLooping] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [newAnnotation, setNewAnnotation] = useState('')
  const [annotationType, setAnnotationType] = useState<'comment' | 'bookmark'>('comment')

  // Load video metadata
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
  }, [isPlaying])

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return

    const newTime = (value[0] / 100) * duration
    video.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return

    const newVolume = value[0] / 100
    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isMuted) {
      video.volume = volume
      setIsMuted(false)
    } else {
      video.volume = 0
      setIsMuted(true)
    }
  }, [isMuted, volume])

  const handlePlaybackSpeedChange = useCallback((speed: number) => {
    const video = videoRef.current
    if (!video) return

    video.playbackRate = speed
    setPlaybackSpeed(speed)
  }, [])

  const skipFrame = useCallback((direction: 'forward' | 'backward') => {
    const video = videoRef.current
    if (!video) return

    // Skip by 1/30th of a second (assuming 30fps)
    const frameTime = 1 / 30
    const newTime = direction === 'forward' 
      ? Math.min(currentTime + frameTime, duration)
      : Math.max(currentTime - frameTime, 0)
    
    video.currentTime = newTime
  }, [currentTime, duration])

  const toggleLoop = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    video.loop = !isLooping
    setIsLooping(!isLooping)
  }, [isLooping])

  const addAnnotation = useCallback(() => {
    if (!newAnnotation.trim() || !onAnnotationAdd) return

    onAnnotationAdd(currentTime, newAnnotation.trim(), annotationType)
    setNewAnnotation('')
  }, [currentTime, newAnnotation, annotationType, onAnnotationAdd])

  const jumpToAnnotation = useCallback((timestamp: number) => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = timestamp
    setCurrentTime(timestamp)
  }, [])

  const enterFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.requestFullscreen) {
      video.requestFullscreen()
    }
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title || 'Video Evidence'}</span>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnnotations(!showAnnotations)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Annotations
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport?.(0, duration)}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video Element */}
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={src}
              className="w-full h-auto"
              preload="metadata"
              crossOrigin="anonymous"
            >
              {subtitles && (
                <track
                  kind="subtitles"
                  src={subtitles}
                  srcLang="en"
                  default
                />
              )}
              Your browser does not support the video tag.
            </video>

            {/* Video Annotations Overlay */}
            {showAnnotations && (
              <div className="absolute inset-0 pointer-events-none">
                {annotations.map((annotation) => {
                  const isVisible = Math.abs(currentTime - annotation.timestamp) < 0.5
                  if (!isVisible) return null

                  return (
                    <div
                      key={annotation.id}
                      className="absolute top-4 right-4 bg-black/75 text-white p-2 rounded text-sm pointer-events-auto"
                    >
                      <div className="flex items-center space-x-2">
                        {annotation.type === 'bookmark' ? (
                          <Bookmark className="h-3 w-3" />
                        ) : (
                          <MessageSquare className="h-3 w-3" />
                        )}
                        <span className="font-medium">{annotation.author}</span>
                      </div>
                      <p className="mt-1">{annotation.text}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Timeline with Annotations */}
          <div className="space-y-2">
            <div className="relative">
              <Slider
                value={[progress]}
                onValueChange={handleSeek}
                max={100}
                step={0.1}
                className="w-full"
              />
              
              {/* Annotation markers on timeline */}
              {annotations.map((annotation) => {
                const position = duration > 0 ? (annotation.timestamp / duration) * 100 : 0
                return (
                  <div
                    key={annotation.id}
                    className="absolute top-0 w-2 h-2 -mt-1 cursor-pointer"
                    style={{ left: `${position}%` }}
                    onClick={() => jumpToAnnotation(annotation.timestamp)}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        annotation.type === 'bookmark' 
                          ? 'bg-yellow-500' 
                          : 'bg-blue-500'
                      }`}
                      title={`${annotation.type}: ${annotation.text}`}
                    />
                  </div>
                )
              })}
            </div>
            
            <div className="flex justify-between text-sm text-gray-600">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* Frame navigation */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => skipFrame('backward')}
                title="Previous frame"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => skipFrame('forward')}
                title="Next frame"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              {/* Main play/pause */}
              <Button onClick={togglePlayPause}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>

              {/* Volume controls */}
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleMute}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  className="w-20"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Playback speed */}
              <select
                value={playbackSpeed}
                onChange={(e) => handlePlaybackSpeedChange(Number(e.target.value))}
                className="text-sm border rounded px-2 py-1"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>

              {/* Loop toggle */}
              <Button
                variant={isLooping ? "default" : "outline"}
                size="sm"
                onClick={toggleLoop}
                title="Toggle loop"
              >
                <Repeat className="h-4 w-4" />
              </Button>

              {/* Fullscreen */}
              <Button
                variant="outline"
                size="sm"
                onClick={enterFullscreen}
                title="Fullscreen"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Add annotation */}
          {onAnnotationAdd && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <select
                      value={annotationType}
                      onChange={(e) => setAnnotationType(e.target.value as 'comment' | 'bookmark')}
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="comment">Comment</option>
                      <option value="bookmark">Bookmark</option>
                    </select>
                    <span className="text-sm text-gray-600">
                      at {formatTime(currentTime)}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Add annotation..."
                      value={newAnnotation}
                      onChange={(e) => setNewAnnotation(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addAnnotation()}
                    />
                    <Button onClick={addAnnotation} disabled={!newAnnotation.trim()}>
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annotations list */}
          {showAnnotations && annotations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Annotations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {annotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-start space-x-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                      onClick={() => jumpToAnnotation(annotation.timestamp)}
                    >
                      <div className="flex-shrink-0">
                        {annotation.type === 'bookmark' ? (
                          <Bookmark className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600">
                            {annotation.author}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(annotation.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 mt-1">{annotation.text}</p>
                      </div>
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

export default VideoPlayer