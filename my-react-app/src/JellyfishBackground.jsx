import { useEffect, useRef } from 'react'

const PALETTE = [
  { r: 119, g: 210, b: 255 },
  { r: 149, g: 158, b: 255 },
  { r: 191, g: 143, b: 255 },
  { r: 111, g: 241, b: 255 },
]

const rand = (min, max) => min + Math.random() * (max - min)
const lerp = (from, to, amount) => from + (to - from) * amount
const smoothstep = (t) => t * t * (3 - 2 * t)
const pick = (values) => values[Math.floor(Math.random() * values.length)]

const hash01 = (value) => {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

const noise1D = (seed, x) => {
  const left = Math.floor(x)
  const t = x - left
  const a = hash01(seed + left)
  const b = hash01(seed + left + 1)
  return lerp(a, b, smoothstep(t)) * 2 - 1
}

const getProfile = (reducedMotion) => {
  if (reducedMotion) {
    return { dprCap: 1, count: 0, frameInterval: Infinity }
  }

  const cores = navigator.hardwareConcurrency ?? 4
  const memory = navigator.deviceMemory ?? 4
  const lite = cores <= 4 || memory <= 4

  return {
    dprCap: lite ? 1.1 : 1.25,
    count: lite ? 3 : 4,
    frameInterval: lite ? 40 : 28,
  }
}

class Jellyfish {
  constructor(width, height) {
    this.seed = rand(0, 10_000)
    this.reset(width, height, true)
  }

  reset(width, height, initial = false) {
    this.width = width
    this.height = height
    this.color = pick(PALETTE)
    this.depth = rand(0.2, 1)
    this.size = rand(34, 72) * (0.8 + this.depth * 0.45)
    this.opacity = 0.16 + this.depth * 0.24
    this.speed = rand(12, 26) * (0.7 + this.depth * 0.7)
    this.x = rand(this.size, width - this.size)
    this.y = initial ? rand(height * 0.08, height * 0.9) : height + this.size
    this.baseX = this.x
    this.swayAmplitude = rand(16, 56) * (0.4 + this.depth * 0.6)
    this.swayFrequency = rand(0.0004, 0.001) * (0.9 + this.depth * 0.35)
    this.swayPhase = rand(0, Math.PI * 2)
    this.wanderFrequency = rand(0.0001, 0.00024)
    this.wanderPhase = rand(0, Math.PI * 2)
    this.pulsePhase = rand(0, Math.PI * 2)
    this.pulseRate = rand(0.0028, 0.0052)
    this.bobAmount = rand(1.5, 6) * (0.5 + this.depth * 0.55)
    this.tentacleCount = 3 + Math.floor(rand(0, 2))
    this.tentaclePhases = Array.from({ length: this.tentacleCount }, () => rand(0, Math.PI * 2))
    this.tentacleWaves = Array.from({ length: this.tentacleCount }, () => rand(0.8, 1.25))
    this.oralArmPhase = rand(0, Math.PI * 2)
    this.rotation = rand(-0.12, 0.12)
  }

  update(deltaTime, time) {
    const dt = deltaTime / 1000
    const drift = noise1D(this.seed + 11, time * this.wanderFrequency + this.wanderPhase) * this.swayAmplitude * 0.1
    const sway = Math.sin(time * this.swayFrequency + this.swayPhase) * this.swayAmplitude
    const smallDrift = noise1D(this.seed + 23, time * 0.00016 + this.swayPhase * 0.4) * this.size * 0.08

    this.y -= this.speed * dt
    this.baseX += drift * dt * 6
    this.x = this.baseX + sway + smallDrift
    this.rotation = lerp(this.rotation, Math.sin(time * 0.00015 + this.seed) * 0.14, 0.04)

    const margin = this.size * 1.6
    if (this.x < -margin) {
      this.baseX = this.width + margin
    } else if (this.x > this.width + margin) {
      this.baseX = -margin
    }

    if (this.y < -margin) {
      this.reset(this.width, this.height, false)
    }
  }

  drawBell(ctx, bellWidth, bellHeight, pulse, alpha) {
    const { r, g, b } = this.color
    const roof = bellHeight * (1.12 + pulse * 0.04)
    const lip = bellHeight * (0.14 + pulse * 0.03)

    ctx.beginPath()
    ctx.moveTo(-bellWidth * 0.6, 0)
    ctx.bezierCurveTo(-bellWidth * 0.76, -roof * 0.16, -bellWidth * 0.4, -roof * 1, 0, -roof * 1.04)
    ctx.bezierCurveTo(bellWidth * 0.4, -roof * 1, bellWidth * 0.76, -roof * 0.16, bellWidth * 0.6, 0)
    ctx.bezierCurveTo(bellWidth * 0.44, lip * 0.72, bellWidth * 0.14, lip, 0, lip * 0.76)
    ctx.bezierCurveTo(-bellWidth * 0.14, lip, -bellWidth * 0.44, lip * 0.72, -bellWidth * 0.6, 0)
    ctx.closePath()

    const shell = ctx.createRadialGradient(0, -roof * 0.55, 0, 0, -roof * 0.2, bellWidth * 1.05)
    shell.addColorStop(0, `rgba(255, 255, 255, ${0.16 + alpha * 0.08})`)
    shell.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, ${0.28 + alpha * 0.18})`)
    shell.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = shell
    ctx.fill()

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + alpha * 0.08})`
    ctx.lineWidth = 1
    ctx.stroke()
  }

  drawTentacles(ctx, bellWidth, bellHeight, pulse, alpha, time) {
    const { r, g, b } = this.color
    const baseY = bellHeight * 0.18
    const spread = bellWidth * 0.1
    const length = bellHeight * (1 + this.depth * 0.85)

    for (let index = 0; index < this.tentacleCount; index += 1) {
      const offset = index - (this.tentacleCount - 1) / 2
      const phase = this.tentaclePhases[index]
      const waveStrength = this.tentacleWaves[index]
    const segmentCount = 3
      let prevX = offset * spread
      let prevY = baseY

      for (let segment = 1; segment <= segmentCount; segment += 1) {
        const t = segment / segmentCount
        const falloff = 1 - t
        const swing =
          Math.sin(time * 0.001 + phase + t * 2.2) * bellWidth * 0.05 * falloff * waveStrength +
          Math.cos(time * 0.00075 + phase * 0.7 + t * 1.6) * bellWidth * 0.015 * falloff
        const curveY = baseY + t * length + Math.sin(time * 0.0012 + phase + t * 4) * 3 * falloff
        const x = offset * spread + swing * (1 - pulse * 0.08)
        const y = curveY + this.bobAmount * falloff

        ctx.strokeStyle = `rgba(${Math.min(r + 24, 255)}, ${Math.min(g + 34, 255)}, ${Math.min(b + 42, 255)}, ${alpha * (0.14 + falloff * 0.26)})`
        ctx.lineWidth = (index % 2 === 0 ? 2.1 : 1.7) * falloff + 0.12
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(x, y)
        ctx.stroke()
        prevX = x
        prevY = y
      }
    }
  }

  drawOralArms(ctx, bellWidth, bellHeight, alpha, time) {
    const { r, g, b } = this.color
    const armCount = 3
    const armBase = bellHeight * 0.12
    const armLength = bellHeight * (0.48 + this.depth * 0.24)

    for (let index = 0; index < armCount; index += 1) {
      const offset = index - (armCount - 1) / 2
      const phase = this.oralArmPhase + index * 0.6
      const startX = offset * bellWidth * 0.08
      const midX = startX + Math.sin(time * 0.0012 + phase) * bellWidth * 0.045
      const endX = startX + Math.cos(time * 0.0008 + phase) * bellWidth * 0.03

      ctx.strokeStyle = `rgba(${Math.min(r + 28, 255)}, ${Math.min(g + 30, 255)}, ${Math.min(b + 42, 255)}, ${0.16 + alpha * 0.2})`
      ctx.lineWidth = 1.6 - Math.abs(offset) * 0.16
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(startX, armBase)
      ctx.bezierCurveTo(midX, armBase + armLength * 0.32, endX, armBase + armLength * 0.72, endX * 0.76, armBase + armLength)
      ctx.stroke()
    }
  }

  draw(ctx, time) {
    const pulse = 1 + Math.sin(time * this.pulseRate + this.pulsePhase) * 0.04
    const scale = this.size * (0.92 + this.depth * 0.35)
    const bellWidth = scale * 0.88 * pulse
    const bellHeight = scale * 0.76 * pulse
    const alpha = this.opacity
    const { r, g, b } = this.color

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation + Math.sin(time * 0.0002 + this.seed) * 0.03)
    ctx.scale(1 + this.depth * 0.04, 1 - this.depth * 0.015)
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = scale * 0.28
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.16 + alpha * 0.12})`

    const halo = ctx.createRadialGradient(0, -bellHeight * 0.05, 0, 0, 0, bellWidth * 1.18)
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.24})`)
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.ellipse(0, 0, bellWidth * 1.05, bellHeight * 1.08, 0, 0, Math.PI * 2)
    ctx.fill()

    const bloom = ctx.createRadialGradient(0, -bellHeight * 0.12, 0, 0, 0, bellWidth * 0.8)
    bloom.addColorStop(0, `rgba(255, 255, 255, ${0.16 + alpha * 0.08})`)
    bloom.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${0.16 + alpha * 0.12})`)
    bloom.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.ellipse(0, 0, bellWidth, bellHeight, 0, 0, Math.PI * 2)
    ctx.fill()

    this.drawBell(ctx, bellWidth, bellHeight, pulse, alpha)
    this.drawOralArms(ctx, bellWidth, bellHeight, alpha, time)
    this.drawTentacles(ctx, bellWidth, bellHeight, pulse, alpha, time)

    ctx.restore()
  }
}

const JellyfishBackground = () => {
  const canvasRef = useRef(null)
  const animationRef = useRef(0)
  const lastTimeRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const profileRef = useRef(null)
  const jellyfishRef = useRef([])
  const backgroundCanvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctx) return undefined

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const syncProfile = () => {
      reducedMotionRef.current = mediaQuery.matches
      profileRef.current = getProfile(reducedMotionRef.current)
    }

    const ensureBackgroundCanvas = () => {
      if (!backgroundCanvasRef.current) {
        backgroundCanvasRef.current = document.createElement('canvas')
      }

      return backgroundCanvasRef.current
    }

    const drawBackground = (backgroundCtx, width, height, reducedMotion) => {
      backgroundCtx.clearRect(0, 0, width, height)

      const sky = backgroundCtx.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#02050f')
      sky.addColorStop(0.48, '#040a18')
      sky.addColorStop(1, '#01020a')
      backgroundCtx.fillStyle = sky
      backgroundCtx.fillRect(0, 0, width, height)

      const topGlow = backgroundCtx.createRadialGradient(width * 0.22, height * 0.16, 0, width * 0.22, height * 0.16, width * 0.72)
      topGlow.addColorStop(0, 'rgba(92, 197, 255, 0.09)')
      topGlow.addColorStop(0.35, 'rgba(92, 197, 255, 0.03)')
      topGlow.addColorStop(1, 'rgba(92, 197, 255, 0)')
      backgroundCtx.fillStyle = topGlow
      backgroundCtx.fillRect(0, 0, width, height)

      const sideGlow = backgroundCtx.createRadialGradient(width * 0.84, height * 0.3, 0, width * 0.84, height * 0.3, width * 0.56)
      sideGlow.addColorStop(0, 'rgba(172, 125, 255, 0.05)')
      sideGlow.addColorStop(0.45, 'rgba(172, 125, 255, 0.018)')
      sideGlow.addColorStop(1, 'rgba(172, 125, 255, 0)')
      backgroundCtx.fillStyle = sideGlow
      backgroundCtx.fillRect(0, 0, width, height)

      if (!reducedMotion) {
        for (let index = 0; index < 2; index += 1) {
          const position = 0.2 + index * 0.32
          const beamX = width * position
          const beamWidth = 64 + index * 16
          const beam = backgroundCtx.createLinearGradient(beamX - beamWidth * 0.5, 0, beamX + beamWidth * 0.5, height)
          beam.addColorStop(0, 'rgba(127, 220, 255, 0)')
          beam.addColorStop(0.5, 'rgba(127, 220, 255, 0.022)')
          beam.addColorStop(1, 'rgba(127, 220, 255, 0)')
          backgroundCtx.fillStyle = beam
          backgroundCtx.fillRect(beamX - beamWidth * 0.5, 0, beamWidth, height)
        }
      }
    }

    const resizeCanvas = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const profile = profileRef.current ?? getProfile(reducedMotionRef.current)
      const dpr = Math.min(window.devicePixelRatio || 1, profile.dprCap)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const backgroundCanvas = ensureBackgroundCanvas()
      backgroundCanvas.width = Math.round(width * dpr)
      backgroundCanvas.height = Math.round(height * dpr)

      const backgroundCtx = backgroundCanvas.getContext('2d', { alpha: true, desynchronized: true })
      if (backgroundCtx) {
        backgroundCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawBackground(backgroundCtx, width, height, reducedMotionRef.current)
      }
    }

    const createJellyfish = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const profile = profileRef.current ?? getProfile(reducedMotionRef.current)

      jellyfishRef.current = Array.from({ length: profile.count }, () => new Jellyfish(width, height)).sort(
        (left, right) => left.depth - right.depth
      )
    }

    const renderFrame = (time, deltaTime) => {
      const width = window.innerWidth
      const height = window.innerHeight
      const backgroundCanvas = backgroundCanvasRef.current

      ctx.clearRect(0, 0, width, height)
      if (backgroundCanvas) {
        ctx.drawImage(backgroundCanvas, 0, 0, width, height)
      }

      jellyfishRef.current.forEach((jellyfish) => {
        jellyfish.update(deltaTime, time)
        jellyfish.draw(ctx, time)
      })
    }

    const animate = (time) => {
      const profile = profileRef.current ?? getProfile(reducedMotionRef.current)

      if (profile.frameInterval === Infinity) {
        renderFrame(time, 0)
        return
      }

      if (lastTimeRef.current && time - lastTimeRef.current < profile.frameInterval) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const deltaTime = lastTimeRef.current ? time - lastTimeRef.current : profile.frameInterval
      lastTimeRef.current = time

      renderFrame(time, deltaTime)
      animationRef.current = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      resizeCanvas()
      createJellyfish()
    }

    syncProfile()
    resizeCanvas()
    createJellyfish()

    if (profileRef.current?.frameInterval === Infinity) {
      renderFrame(performance.now(), 0)
    } else {
      animationRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('resize', handleResize)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncProfile)
    } else {
      mediaQuery.addListener(syncProfile)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', syncProfile)
      } else {
        mediaQuery.removeListener(syncProfile)
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

export default JellyfishBackground
