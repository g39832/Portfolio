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
    this.size = rand(30, 64) * (0.8 + this.depth * 0.45)
    this.opacity = 0.09 + this.depth * 0.19
    this.speed = rand(10, 22) * (0.7 + this.depth * 0.7)
    this.x = rand(this.size, width - this.size)
    this.y = initial ? rand(height * 0.08, height * 0.9) : height + this.size
    this.baseX = this.x
    this.swayAmplitude = rand(16, 56) * (0.4 + this.depth * 0.6)
    this.swayFrequency = rand(0.0004, 0.001) * (0.9 + this.depth * 0.35)
    this.swayPhase = rand(0, Math.PI * 2)
    this.wanderFrequency = rand(0.0001, 0.00024)
    this.wanderPhase = rand(0, Math.PI * 2)
    this.pulsePhase = rand(0, Math.PI * 2)
    this.pulseRate = rand(0.0042, 0.007)
    this.pulseAmount = rand(0.07, 0.14)
    this.bobAmount = rand(1.5, 6) * (0.5 + this.depth * 0.55)
    this.rotation = rand(-0.1, 0.1)
    this.lobeCount = 8 + Math.floor(rand(0, 3))
    this.lobeOffset = rand(0, Math.PI * 2)
    this.fringeCount = 16 + Math.floor(rand(0, 5))
    this.fringePhases = Array.from({ length: this.fringeCount }, () => rand(0, Math.PI * 2))
    this.fringeWaves = Array.from({ length: this.fringeCount }, () => rand(0.6, 1.15))
    this.armPhase = rand(0, Math.PI * 2)
    this.armLengthRatio = rand(0.75, 1.05)
  }

  update(deltaTime, time) {
    const dt = deltaTime / 1000
    const drift = noise1D(this.seed + 11, time * this.wanderFrequency + this.wanderPhase) * this.swayAmplitude * 0.1
    const sway = Math.sin(time * this.swayFrequency + this.swayPhase) * this.swayAmplitude
    const smallDrift = noise1D(this.seed + 23, time * 0.00016 + this.swayPhase * 0.4) * this.size * 0.08

    // Realistic swimming: each bell contraction gives a little burst of propulsion
    const contract = Math.sin(time * this.pulseRate + this.pulsePhase)
    const propulsion = Math.max(0, contract) * this.speed * 0.9
    this.y -= (this.speed + propulsion) * dt
    this.baseX += drift * dt * 6
    this.x = this.baseX + sway + smallDrift
    this.rotation = lerp(this.rotation, Math.sin(time * 0.00015 + this.seed) * 0.12, 0.04)

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

  // Translucent dome with a scalloped (lobed) rim, like a moon jellyfish
  drawBellPath(ctx, bellWidth, roof, lip) {
    ctx.beginPath()
    ctx.moveTo(-bellWidth * 0.5, 0)
    ctx.bezierCurveTo(-bellWidth * 0.7, -roof * 0.24, -bellWidth * 0.28, -roof, 0, -roof * 1.04)
    ctx.bezierCurveTo(bellWidth * 0.28, -roof, bellWidth * 0.7, -roof * 0.24, bellWidth * 0.5, 0)

    for (let index = 0; index < this.lobeCount; index += 1) {
      const t0 = index / this.lobeCount
      const t1 = (index + 1) / this.lobeCount
      const x0 = lerp(bellWidth * 0.5, -bellWidth * 0.5, t0)
      const x1 = lerp(bellWidth * 0.5, -bellWidth * 0.5, t1)
      const y0 = lip * (1 + Math.sin(t0 * Math.PI * this.lobeCount + this.lobeOffset) * 0.4)
      const y1 = lip * (1 + Math.sin(t1 * Math.PI * this.lobeCount + this.lobeOffset) * 0.4)
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + lip * 0.3, x1, y1)
    }
    ctx.closePath()
  }

  drawBell(ctx, bellWidth, bellHeight, alpha, time) {
    const { r, g, b } = this.color
    const roof = bellHeight * 1.2
    const lip = bellHeight * 0.2

    ctx.save()
    this.drawBellPath(ctx, bellWidth, roof, lip)

    const shell = ctx.createRadialGradient(0, -roof * 0.45, 0, 0, -roof * 0.1, bellWidth * 0.9)
    shell.addColorStop(0, `rgba(255, 255, 255, ${0.18 + alpha * 0.1})`)
    shell.addColorStop(0.32, `rgba(${r}, ${g}, ${b}, ${0.2 + alpha * 0.16})`)
    shell.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${0.07 + alpha * 0.08})`)
    shell.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.02)`)
    ctx.fillStyle = shell
    ctx.fill()

    // Internal anatomy, clipped to the bell so it stays inside the dome
    ctx.clip()
    this.drawCanals(ctx, bellWidth, bellHeight, roof, alpha, time)
    this.drawGonads(ctx, bellWidth, bellHeight, roof, alpha)
    ctx.restore()

    this.drawBellPath(ctx, bellWidth, roof, lip)
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.07 + alpha * 0.1})`
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Radial canals — the fine veins visible through a translucent bell
  drawCanals(ctx, bellWidth, bellHeight, roof, alpha, time) {
    const { r, g, b } = this.color
    const count = 14
    ctx.lineWidth = 0.7
    ctx.lineCap = 'round'
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2
      const inner = bellHeight * 0.16
      const outer = bellWidth * 0.48
      const wobble = Math.sin(time * 0.0007 + index * 1.9 + this.seed) * 0.05
      ctx.strokeStyle = `rgba(${Math.min(r + 34, 255)}, ${Math.min(g + 34, 255)}, ${Math.min(b + 48, 255)}, ${0.08 + alpha * 0.1})`
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * inner, -roof * 0.3 + Math.sin(angle) * inner * 0.5)
      ctx.quadraticCurveTo(
        Math.cos(angle + wobble) * outer * 0.6,
        -roof * 0.1 + Math.sin(angle + wobble) * outer * 0.6,
        Math.cos(angle) * outer,
        -roof * 0.05 + Math.sin(angle) * outer * 0.9
      )
      ctx.stroke()
    }
  }

  // Four horseshoe-shaped gonads near the centre of the bell
  drawGonads(ctx, bellWidth, bellHeight, roof, alpha) {
    const { r, g, b } = this.color
    const radius = bellHeight * 0.14
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4
      const cx = Math.cos(angle) * bellHeight * 0.3
      const cy = -roof * 0.34 + Math.sin(angle) * bellHeight * 0.24
      ctx.strokeStyle = `rgba(${Math.min(r + 52, 255)}, ${Math.min(g + 44, 255)}, ${Math.min(b + 62, 255)}, ${0.12 + alpha * 0.12})`
      ctx.beginPath()
      ctx.arc(cx, cy, radius, angle + 0.5, angle + Math.PI * 2 - 0.5)
      ctx.stroke()
    }
  }

  // Fine fringe of tentacles hanging all around the rim
  drawRimTentacles(ctx, bellWidth, bellHeight, pulse, alpha, time) {
    const { r, g, b } = this.color
    const count = this.fringeCount
    const lip = bellHeight * 0.2

    for (let index = 0; index < count; index += 1) {
      const t = (index + 0.5) / count
      const x = lerp(-bellWidth * 0.5, bellWidth * 0.5, t)
      const rimY = lip * (1 + Math.sin(t * Math.PI * this.lobeCount + this.lobeOffset) * 0.4)
      const phase = this.fringePhases[index]
      const wave = this.fringeWaves[index]
      const length = bellHeight * (0.3 + this.depth * 0.35) * (1 + pulse * 0.08)
      const segments = 4
      let prevX = x
      let prevY = rimY

      for (let segment = 1; segment <= segments; segment += 1) {
        const progress = segment / segments
        const falloff = 1 - progress
        const swing = Math.sin(time * 0.0011 + phase + progress * 2.6) * bellWidth * 0.02 * wave * falloff
        const nextX = x + swing
        const nextY = rimY + progress * length + Math.sin(time * 0.0013 + phase + progress * 5) * 2.4 * falloff

        ctx.strokeStyle = `rgba(${Math.min(r + 26, 255)}, ${Math.min(g + 32, 255)}, ${Math.min(b + 44, 255)}, ${alpha * (0.2 + falloff * 0.3)})`
        ctx.lineWidth = Math.max(0.3, 1.1 * falloff)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(nextX, nextY)
        ctx.stroke()
        prevX = nextX
        prevY = nextY
      }
    }
  }

  // Four long, frilly oral arms hanging from the centre underside
  drawOralArms(ctx, bellWidth, bellHeight, pulse, alpha, time) {
    const { r, g, b } = this.color
    const armCount = 4
    const armBase = bellHeight * 0.16
    const armLength = bellHeight * this.armLengthRatio * (1 + pulse * 0.06)
    const segmentCount = 8
    const ruffles = 2.2

    for (let index = 0; index < armCount; index += 1) {
      const offset = (index - (armCount - 1) / 2) / (armCount - 1)
      const phase = this.armPhase + index * 0.9
      const startX = offset * bellWidth * 0.34
      const sway =
        Math.sin(time * 0.001 + phase) * bellWidth * 0.05 +
        Math.cos(time * 0.0006 + phase * 0.6) * bellWidth * 0.02

      const pointAt = (step) => {
        const t = step / segmentCount
        const ruffleX = Math.sin(t * Math.PI * ruffles + phase + time * 0.0016) * bellHeight * 0.07 * t
        return [startX + sway * t + ruffleX, armBase + t * armLength]
      }

      const points = Array.from({ length: segmentCount + 1 }, (_, step) => pointAt(step))
      const widthAt = (step) =>
        (0.5 + Math.sin(step * 2.3 + phase) * 0.4) * bellHeight * 0.09 * (1 - (step / segmentCount) * 0.55)

      // Frilly ribbon: edges wiggle in and out along the arm
      ctx.beginPath()
      points.forEach(([x, y], step) => {
        const width = widthAt(step)
        if (step === 0) ctx.moveTo(x, y - width)
        else ctx.lineTo(x, y - width)
      })
      for (let step = points.length - 1; step >= 0; step -= 1) {
        const [x, y] = points[step]
        ctx.lineTo(x, y + widthAt(step))
      }
      ctx.closePath()
      ctx.fillStyle = `rgba(${Math.min(r + 30, 255)}, ${Math.min(g + 30, 255)}, ${Math.min(b + 44, 255)}, ${0.12 + alpha * 0.12})`
      ctx.fill()

      ctx.strokeStyle = `rgba(${Math.min(r + 44, 255)}, ${Math.min(g + 44, 255)}, ${Math.min(b + 58, 255)}, ${0.16 + alpha * 0.14})`
      ctx.lineWidth = 0.9
      ctx.beginPath()
      points.forEach(([x, y], step) => {
        if (step === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }

  draw(ctx, time, light) {
    const contract = Math.sin(time * this.pulseRate + this.pulsePhase)
    const scale = this.size * (0.92 + this.depth * 0.35)
    // The bell flattens and widens as it contracts, then relaxes — the swimming pulse
    const bellWidth = scale * 0.96 * (1 + contract * this.pulseAmount * 0.5)
    const bellHeight = scale * 0.74 * (1 - contract * this.pulseAmount * 0.75)
    const alpha = this.opacity * (light ? 2 : 1)
    const { r, g, b } = this.color

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation + Math.sin(time * 0.0002 + this.seed) * 0.03)
    ctx.scale(1 + this.depth * 0.04, 1 - this.depth * 0.015)
    // Additive glow on dark; soft translucent shapes on light
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'

    const halo = ctx.createRadialGradient(0, -bellHeight * 0.05, 0, 0, 0, bellWidth * 1.2)
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * (light ? 0.1 : 0.22)})`)
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.ellipse(0, 0, bellWidth * 1.06, bellHeight * 1.1, 0, 0, Math.PI * 2)
    ctx.fill()

    const bloom = ctx.createRadialGradient(0, -bellHeight * 0.12, 0, 0, 0, bellWidth * 0.82)
    bloom.addColorStop(0, `rgba(255, 255, 255, ${light ? 0.5 : 0.14 + alpha * 0.08})`)
    bloom.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${light ? 0.2 + alpha * 0.05 : 0.14 + alpha * 0.1})`)
    bloom.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.ellipse(0, 0, bellWidth, bellHeight, 0, 0, Math.PI * 2)
    ctx.fill()

    this.drawRimTentacles(ctx, bellWidth, bellHeight, contract, alpha, time)
    this.drawOralArms(ctx, bellWidth, bellHeight, contract, alpha, time)
    this.drawBell(ctx, bellWidth, bellHeight, alpha, time)

    ctx.restore()
  }
}

const JellyfishBackground = ({ theme = 'dark', paused = false }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(0)
  const lastTimeRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const profileRef = useRef(null)
  const jellyfishRef = useRef([])
  const backgroundCanvasRef = useRef(null)
  const lightRef = useRef(theme === 'light')
  const pausedRef = useRef(paused)
  const frozenTimeRef = useRef(0)
  const redrawBackgroundRef = useRef(null)

  useEffect(() => {
    lightRef.current = theme === 'light'
    redrawBackgroundRef.current?.()
  }, [theme])

  useEffect(() => {
    pausedRef.current = paused
    if (paused) frozenTimeRef.current = performance.now()
  }, [paused])

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

    const drawBackground = (backgroundCtx, width, height, reducedMotion, light) => {
      backgroundCtx.clearRect(0, 0, width, height)

      if (light) {
        const sky = backgroundCtx.createLinearGradient(0, 0, 0, height)
        sky.addColorStop(0, '#f6faff')
        sky.addColorStop(0.5, '#eaf2fc')
        sky.addColorStop(1, '#e3ecf9')
        backgroundCtx.fillStyle = sky
        backgroundCtx.fillRect(0, 0, width, height)

        const topGlow = backgroundCtx.createRadialGradient(width * 0.22, height * 0.16, 0, width * 0.22, height * 0.16, width * 0.72)
        topGlow.addColorStop(0, 'rgba(84, 180, 255, 0.16)')
        topGlow.addColorStop(0.35, 'rgba(84, 180, 255, 0.05)')
        topGlow.addColorStop(1, 'rgba(84, 180, 255, 0)')
        backgroundCtx.fillStyle = topGlow
        backgroundCtx.fillRect(0, 0, width, height)

        const sideGlow = backgroundCtx.createRadialGradient(width * 0.84, height * 0.3, 0, width * 0.84, height * 0.3, width * 0.56)
        sideGlow.addColorStop(0, 'rgba(150, 110, 255, 0.12)')
        sideGlow.addColorStop(0.45, 'rgba(150, 110, 255, 0.04)')
        sideGlow.addColorStop(1, 'rgba(150, 110, 255, 0)')
        backgroundCtx.fillStyle = sideGlow
        backgroundCtx.fillRect(0, 0, width, height)
      } else {
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
        drawBackground(backgroundCtx, width, height, reducedMotionRef.current, lightRef.current)
      }
    }

    redrawBackgroundRef.current = resizeCanvas

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
      const frozen = pausedRef.current

      ctx.clearRect(0, 0, width, height)
      if (backgroundCanvas) {
        ctx.drawImage(backgroundCanvas, 0, 0, width, height)
      }

      const drawTime = frozen ? frozenTimeRef.current : time

      jellyfishRef.current.forEach((jellyfish) => {
        if (!frozen) jellyfish.update(deltaTime, time)
        jellyfish.draw(ctx, drawTime, lightRef.current)
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
