'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  SkipBack, 
  SkipForward, 
  Download,
  Settings,
  Activity,
  Waves,
  BarChart3,
  Filter,
  Scissors,
  Save
} from 'lucide-react'
import { formatTime } from '@/lib/utils'

// WaveSurfer types (simplified for now)
interface WaveSurferInstance {
  load: (url: string) => void
  play: () => void
  pause: () => void
  setVolume: (volume: number) => void
  seekTo: (position: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  on: (event: string, callback: Function) => void
  off: (event: string, callback: Function) => void
  destroy: () => void
  getDecodedData: () => AudioBuffer | null
}

interface AudioEnhancement {
  noiseReduction: number
  amplification: number
  lowCutFilter: number
  highCutFilter: number
  compressor: boolean
}

interface AudioTrack {
  id: string
  name: string
  url: string
  color: string
  volume: number
  muted: boolean
  solo: boolean
}

interface AudioPlayerProps {
  src: string
  title?: string
  tracks?: AudioTrack[]
  onExport?: (enhancedAudioBlob: Blob) => void
  className?: string
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  tracks = [],
  onExport,
  className = ''
}) => {
  const waveformRef = useRef<HTMLDivElement>(null)
  const spectrogramRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurferInstance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showSpectrogram, setShowSpectrogram] = useState(false)
  const [enhancement, setEnhancement] = useState<AudioEnhancement>({
    noiseReduction: 0,
    amplification: 0,
    lowCutFilter: 0,
    highCutFilter: 20000,
    compressor: false
  })
  const [multiTrackMode, setMultiTrackMode] = useState(false)
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>(tracks)

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current) return

    // For now, we'll create a basic implementation
    // In a real implementation, you would import and initialize WaveSurfer.js here
    const initWaveSurfer = async () => {
      try {
        // Mock WaveSurfer initialization
        const mockWaveSurfer: WaveSurferInstance = {
          load: (url: string) => {
            console.log('Loading audio:', url)
            // Simulate loading
            setTimeout(() => {
              setDuration(120) // Mock 2-minute duration
            }, 1000)
          },
          play: () => {
            setIsPlaying(true)
            // Start time updates
            const interval = setInterval(() => {
              setCurrentTime(prev => {
                if (prev >= duration) {
                  setIsPlaying(false)
                  clearInterval(interval)
                  return 0
                }
                return prev + 0.1
              })
            }, 100)
          },
          pause: () => {
            setIsPlaying(false)
          },
          setVolume: (vol: number) => {
            setVolume(vol)
          },
          seekTo: (position: number) => {
            setCurrentTime(position * duration)
          },
          getCurrentTime: () => currentTime,
          getDuration: () => duration,
          on: (event: string, callback: Function) => {
            console.log('Event listener added:', event)
          },
          off: (event: string, callback: Function) => {
            console.log('Event listener removed:', event)
          },
          destroy: () => {
            console.log('WaveSurfer destroyed')
          },
          getDecodedData: () => null
        }

        wavesurferRef.current = mockWaveSurfer
        mockWaveSurfer.load(src)
      } catch (error) {
        console.error('Failed to initialize WaveSurfer:', error)
      }
    }

    initWaveSurfer()

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy()
      }
    }
  }, [src, duration, currentTime])

  // Initialize Web Audio API for spectrogram
  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.error('Web Audio API not supported:', error)
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer) return

    if (isPlaying) {
      wavesurfer.pause()
    } else {
      wavesurfer.play()
    }
  }, [isPlaying])

  const handleSeek = useCallback((value: number[]) => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer) return

    const position = value[0] / 100
    wavesurfer.seekTo(position)
  }, [])

  const handleVolumeChange = useCallback((value: number[]) => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer) return

    const newVolume = value[0] / 100
    wavesurfer.setVolume(newVolume)
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }, [])

  const toggleMute = useCallback(() => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer) return

    if (isMuted) {
      wavesurfer.setVolume(volume)
      setIsMuted(false)
    } else {
      wavesurfer.setVolume(0)
      setIsMuted(true)
    }
  }, [isMuted, volume])

  const handleEnhancementChange = useCallback((key: keyof AudioEnhancement, value: number | boolean) => {
    setEnhancement(prev => ({
      ...prev,
      [key]: value
    }))
    
    // In a real implementation, you would apply audio processing here
    console.log('Audio enhancement changed:', key, value)
  }, [])

  const toggleTrackMute = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track => 
      track.id === trackId 
        ? { ...track, muted: !track.muted }
        : track
    ))
  }, [])

  const toggleTrackSolo = useCallback((trackId: string) => {
    setAudioTracks(prev => prev.map(track => 
      track.id === trackId 
        ? { ...track, solo: !track.solo }
        : { ...track, solo: false }
    ))
  }, [])

  const handleTrackVolumeChange = useCallback((trackId: string, volume: number) => {
    setAudioTracks(prev => prev.map(track => 
      track.id === trackId 
        ? { ...track, volume }
        : track
    ))
  }, [])

  const exportEnhancedAudio = useCallback(async () => {
    if (!audioContextRef.current || !onExport) return

    try {
      // In a real implementation, you would:
      // 1. Get the audio buffer from WaveSurfer
      // 2. Apply all enhancement filters
      // 3. Render to a new audio buffer
      // 4. Convert to Blob
      
      // Mock implementation
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/wav' })
      onExport(mockBlob)
      
      console.log('Exporting enhanced audio with settings:', enhancement)
    } catch (error) {
      console.error('Failed to export enhanced audio:', error)
    }
  }, [enhancement, onExport])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title || 'Audio Evidence'}</span>
            <div className="flex items-center space-x-2">
              <Button
                variant={showSpectrogram ? "default" : "outline"}
                size="sm"
                onClick={() => setShowSpectrogram(!showSpectrogram)}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Spectrogram
              </Button>
              <Button
                variant={multiTrackMode ? "default" : "outline"}
                size="sm"
                onClick={() => setMultiTrackMode(!multiTrackMode)}
                disabled={audioTracks.length === 0}
              >
                <Activity className="h-4 w-4 mr-2" />
                Multi-track
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportEnhancedAudio}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Waveform Display */}
          <div className="bg-gray-900 rounded-lg p-4">
            <div 
              ref={waveformRef}
              className="w-full h-32 bg-black rounded flex items-center justify-center"
            >
              <div className="flex items-center space-x-2 text-white">
                <Waves className="h-8 w-8" />
                <span>Audio Waveform</span>
              </div>
            </div>
            
            {/* Spectrogram */}
            {showSpectrogram && (
              <div 
                ref={spectrogramRef}
                className="w-full h-32 bg-black rounded mt-2 flex items-center justify-center"
              >
                <div className="flex items-center space-x-2 text-white">
                  <BarChart3 className="h-8 w-8" />
                  <span>Frequency Spectrogram</span>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[progress]}
              onValueChange={handleSeek}
              max={100}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-600">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeek([Math.max(0, progress - 1)])}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button onClick={togglePlayPause}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeek([Math.min(100, progress + 1)])}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Volume controls */}
              <div className="flex items-center space-x-2 ml-4">
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
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="text-sm border rounded px-2 py-1"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </div>
          </div>

          {/* Multi-track Mixer */}
          {multiTrackMode && audioTracks.length > 0 && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-sm">Track Mixer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {audioTracks.map((track) => (
                    <div key={track.id} className="flex items-center space-x-3">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: track.color }}
                      />
                      <span className="text-sm font-medium min-w-0 flex-1">
                        {track.name}
                      </span>
                      <Button
                        variant={track.muted ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleTrackMute(track.id)}
                      >
                        {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant={track.solo ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleTrackSolo(track.id)}
                      >
                        S
                      </Button>
                      <Slider
                        value={[track.volume * 100]}
                        onValueChange={(value) => handleTrackVolumeChange(track.id, value[0] / 100)}
                        max={100}
                        className="w-20"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audio Enhancement Controls */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center">
                <Filter className="h-4 w-4 mr-2" />
                Audio Enhancement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Noise Reduction: {enhancement.noiseReduction}%
                  </label>
                  <Slider
                    value={[enhancement.noiseReduction]}
                    onValueChange={(value) => handleEnhancementChange('noiseReduction', value[0])}
                    max={100}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Amplification: {enhancement.amplification > 0 ? '+' : ''}{enhancement.amplification}dB
                  </label>
                  <Slider
                    value={[enhancement.amplification]}
                    onValueChange={(value) => handleEnhancementChange('amplification', value[0])}
                    min={-20}
                    max={20}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Low Cut Filter: {enhancement.lowCutFilter}Hz
                  </label>
                  <Slider
                    value={[enhancement.lowCutFilter]}
                    onValueChange={(value) => handleEnhancementChange('lowCutFilter', value[0])}
                    max={1000}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    High Cut Filter: {enhancement.highCutFilter}Hz
                  </label>
                  <Slider
                    value={[enhancement.highCutFilter]}
                    onValueChange={(value) => handleEnhancementChange('highCutFilter', value[0])}
                    min={1000}
                    max={20000}
                    className="w-full"
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={enhancement.compressor}
                      onChange={(e) => handleEnhancementChange('compressor', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Dynamic Range Compression
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end mt-4 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEnhancement({
                    noiseReduction: 0,
                    amplification: 0,
                    lowCutFilter: 0,
                    highCutFilter: 20000,
                    compressor: false
                  })}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={exportEnhancedAudio}
                >
                  <Save className="h-3 w-3 mr-1" />
                  Apply & Export
                </Button>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}

export default AudioPlayer