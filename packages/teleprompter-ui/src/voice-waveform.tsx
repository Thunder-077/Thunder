"use client"

import { useCallback, useEffect, useRef } from "react"
import type { FollowStatus } from "../../teleprompter-core/src/index"
import { cn } from "@thunder/ui"

export function VoiceWaveform({ status, isMicActive = false }: { status: FollowStatus; isMicActive?: boolean }) {
  const barsRef = useRef<HTMLDivElement[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  const cleanupAudio = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  useEffect(() => {
    if (!isMicActive) {
      cleanupAudio()
      return
    }

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioContextClass()
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)
        analyserRef.current = analyser

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const updateWave = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)

          let sum = 0
          for (let i = 0; i < bufferLength; i += 1) {
            sum += dataArray[i]
          }
          const average = sum / bufferLength
          const volume = Math.min(Math.max(average / 110, 0), 1)

          barsRef.current.forEach((bar, index) => {
            if (!bar) return
            const multipliers = [0.5, 1.0, 1.4, 0.9, 0.6]
            const baseScales = [0.25, 0.4, 0.5, 0.4, 0.25]
            const multiplier = multipliers[index] || 1
            const baseScale = baseScales[index] || 0.25
            const scaleY = Math.min(baseScale + volume * multiplier * 0.8, 1.4)
            bar.style.transform = `scaleY(${scaleY})`
          })

          animationFrameIdRef.current = requestAnimationFrame(updateWave)
        }

        updateWave()
      } catch {
        // 忽略可视化初始化失败，避免影响主流程。
      }
    }

    void initAudio()
    return () => {
      cleanupAudio()
    }
  }, [cleanupAudio, isMicActive])

  const getBarColorClass = () => {
    switch (status) {
      case "following":
      case "listening":
        return "bg-emerald-400"
      case "paused":
        return "bg-amber-400"
      case "failed":
        return "bg-rose-400"
      default:
        return "bg-slate-400/80"
    }
  }

  return (
    <div className="flex h-5 w-8 items-center justify-between gap-[2.5px] px-[2px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el
          }}
          className={cn(
            "h-full w-[3.2px] rounded-full origin-center transition-transform duration-75",
            getBarColorClass(),
          )}
          style={{ transform: `scaleY(${[0.25, 0.4, 0.5, 0.4, 0.25][i]})` }}
        />
      ))}
    </div>
  )
}
