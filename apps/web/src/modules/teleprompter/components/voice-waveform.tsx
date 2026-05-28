"use client"

import { useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { FollowStatus } from "../utils/follow-state-machine"

export function VoiceWaveform({ status }: { status: FollowStatus }) {
  const barsRef = useRef<HTMLDivElement[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  const isActive = status === "following" || status === "listening"

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
    if (!isActive) {
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
            const scaleY = baseScale + volume * multiplier * 0.8
            const finalScaleY = Math.min(scaleY, 1.4)
            bar.style.transform = `scaleY(${finalScaleY})`
          })

          animationFrameIdRef.current = requestAnimationFrame(updateWave)
        }

        updateWave()
      } catch (err) {
        console.warn("Failed to initialize audio visualization:", err)
      }
    }

    initAudio()

    return () => {
      cleanupAudio()
    }
  }, [isActive, cleanupAudio])

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

  const getBarStyle = (index: number) => {
    if (isActive) {
      return {
        transform: `scaleY(${[0.25, 0.4, 0.5, 0.4, 0.25][index]})`,
      }
    }

    const baseScales = [0.25, 0.4, 0.5, 0.4, 0.25]
    const delays = [0, 0.15, 0.3, 0.15, 0]
    const dur = status === "paused" ? "2.5s" : "2s"
    const animName = status === "failed" ? "voice-failed-shake" : "voice-idle-breath"

    return {
      transform: `scaleY(${baseScales[index]})`,
      animation: `${animName} ${dur} ease-in-out infinite`,
      animationDelay: `${delays[index]}s`,
    }
  }

  return (
    <div className="flex h-5 w-8 items-center justify-between gap-[2.5px] px-[2px]">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes voice-idle-breath {
          0%, 100% { transform: scaleY(0.25); }
          50% { transform: scaleY(0.65); }
        }
        @keyframes voice-failed-shake {
          0%, 100% { transform: scaleY(0.25); opacity: 0.5; }
          50% { transform: scaleY(0.4); opacity: 1; }
        }
      `}} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el
          }}
          className={cn(
            "h-full w-[3.2px] rounded-full origin-center transition-transform duration-75",
            getBarColorClass()
          )}
          style={getBarStyle(i)}
        />
      ))}
    </div>
  )
}
