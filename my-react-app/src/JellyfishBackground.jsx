import { useEffect, useRef } from 'react'

const PALETTE = [
  { r: 119, g: 210, b: 255 },
  { r: 149, g: 158, b: 255 },
  { r: 191, g: 143, b: 255 },
  { r: 111, g: 241, b: 255 },
]

const LURE = { r: 140, g: 255, b: 222 }

const rand = (min, max) => min + Math.random() * (max - min)
const lerp = (from, to, amount) => from + (to - from) * amount
const smoothstep = (t) => t * t * (3 - 2 * t)
const pick = (values) => values[Math.floor(Math.random() * values.length)]
const rgba = ({ r, g, b }, alpha, lift = 0) =>
  `rgba(${Math.min(r + lift, 255)}, ${Math.min(g + lift, 255)}, ${Math.min(b + lift, 255)}, ${alpha})`

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
    return { dprCap: 1, count: 0, snow: 40, fish: false, frameInterval: Infinity }
  }

  const cores = navigator.hardwareConcurrency ?? 4
  const memory = navigator.deviceMemory ?? 4
  const lite = cores <= 4 || memory <= 4
  const narrow = window.innerWidth < 700

  return {
    dprCap: lite ? 1.1 : 1.25,
    count: narrow ? 3 : lite ? 4 : 5,
    snow: narrow ? 28 : lite ? 40 : 64,
    fish: true,
    frameInterval: lite ? 40 : 28,
  }
}

/* ---------------------------------------------------------------------------
 * Jellyfish — a translucent moon-jelly bell with trailing tentacles
 * ------------------------------------------------------------------------- */
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
    this.size = rand(28, 60) * (0.8 + this.depth * 0.45)
    this.opacity = 0.1 + this.depth * 0.18
    this.speed = rand(9, 20) * (0.7 + this.depth * 0.7)
    this.x = rand(this.size, width - this.size)
    this.y = initial ? rand(height * 0.1, height * 0.95) : height + this.size * 3
    this.baseX = this.x
    this.swayAmplitude = rand(14, 48) * (0.4 + this.depth * 0.6)
    this.swayFrequency = rand(0.0004, 0.0009)
    this.swayPhase = rand(0, Math.PI * 2)
    this.wanderFrequency = rand(0.0001, 0.00024)
    this.wanderPhase = rand(0, Math.PI * 2)
    this.pulsePhase = rand(0, Math.PI * 2)
    this.pulseRate = rand(0.0038, 0.0062)
    this.pulseAmount = rand(0.08, 0.14)
    this.rotation = 0
    this.lobeCount = 10 + Math.floor(rand(0, 4))
    const tentacleCount = 9 + Math.floor(rand(0, 4))
    this.tentacles = Array.from({ length: tentacleCount }, (_, index) => ({
      at: (index + 0.5) / tentacleCount,
      length: rand(1.4, 2.4),
      phase: rand(0, Math.PI * 2),
      wave: rand(0.7, 1.2),
    }))
    this.arms = Array.from({ length: 4 }, (_, index) => ({
      offset: (index - 1.5) / 1.5,
      length: rand(0.9, 1.3),
      phase: rand(0, Math.PI * 2),
    }))
  }

  update(deltaTime, time) {
    const dt = deltaTime / 1000
    const drift = noise1D(this.seed + 11, time * this.wanderFrequency + this.wanderPhase) * this.swayAmplitude * 0.1
    const sway = Math.sin(time * this.swayFrequency + this.swayPhase) * this.swayAmplitude

    // Each bell contraction gives a little burst of propulsion
    const contract = Math.sin(time * this.pulseRate + this.pulsePhase)
    const propulsion = Math.max(0, contract) * this.speed * 0.9
    this.y -= (this.speed + propulsion) * dt
    this.baseX += drift * dt * 6
    this.x = this.baseX + sway
    this.rotation = lerp(this.rotation, Math.cos(time * this.swayFrequency + this.swayPhase) * 0.1, 0.05)

    const margin = this.size * 1.6
    if (this.x < -margin) this.baseX = this.width + margin
    else if (this.x > this.width + margin) this.baseX = -margin

    if (this.y < -this.size * 3) this.reset(this.width, this.height, false)
  }

  // Smooth dome with a softly scalloped rim
  bellPath(ctx, bellWidth, roof, lip) {
    ctx.beginPath()
    ctx.moveTo(-bellWidth * 0.5, 0)
    ctx.bezierCurveTo(-bellWidth * 0.62, -roof * 0.42, -bellWidth * 0.3, -roof, 0, -roof)
    ctx.bezierCurveTo(bellWidth * 0.3, -roof, bellWidth * 0.62, -roof * 0.42, bellWidth * 0.5, 0)
    for (let index = 0; index < this.lobeCount; index += 1) {
      const x0 = lerp(bellWidth * 0.5, -bellWidth * 0.5, index / this.lobeCount)
      const x1 = lerp(bellWidth * 0.5, -bellWidth * 0.5, (index + 1) / this.lobeCount)
      ctx.quadraticCurveTo((x0 + x1) / 2, lip, x1, 0)
    }
    ctx.closePath()
  }

  drawTentacles(ctx, bellWidth, bellHeight, alpha, time) {
    ctx.lineCap = 'round'
    this.tentacles.forEach((tentacle) => {
      const startX = lerp(-bellWidth * 0.46, bellWidth * 0.46, tentacle.at)
      const length = bellHeight * tentacle.length * (0.8 + this.depth * 0.4)
      const steps = 6
      const points = []
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        // The wave travels down the tentacle, so the tip lags the base
        const swing = Math.sin(time * 0.0012 * tentacle.wave + tentacle.phase - t * 2.4) * bellWidth * 0.12 * t
        points.push([startX * (1 - t * 0.35) + swing, bellHeight * 0.08 + t * length])
      }

      const fade = ctx.createLinearGradient(0, points[0][1], 0, points[steps][1])
      fade.addColorStop(0, rgba(this.color, alpha * 0.75, 40))
      fade.addColorStop(1, rgba(this.color, 0, 40))
      ctx.strokeStyle = fade
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      for (let step = 1; step < steps; step += 1) {
        const [x, y] = points[step]
        const [nx, ny] = points[step + 1]
        ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
      }
      ctx.lineTo(points[steps][0], points[steps][1])
      ctx.stroke()
    })
  }

  // Soft, ribbon-like oral arms hanging from the centre
  drawArms(ctx, bellWidth, bellHeight, alpha, time) {
    this.arms.forEach((arm) => {
      const startX = arm.offset * bellWidth * 0.14
      const length = bellHeight * arm.length
      const steps = 6
      const left = []
      const right = []
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const x = startX + Math.sin(time * 0.0009 + arm.phase - t * 2) * bellWidth * 0.08 * t
        const y = bellHeight * 0.05 + t * length
        const half = bellHeight * 0.07 * (1 - t * 0.7) * (0.8 + Math.sin(t * 9 + arm.phase) * 0.2)
        left.push([x - half, y])
        right.push([x + half, y])
      }
      ctx.beginPath()
      ctx.moveTo(left[0][0], left[0][1])
      left.forEach(([x, y]) => ctx.lineTo(x, y))
      right.reverse().forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.closePath()
      const fill = ctx.createLinearGradient(0, 0, 0, length)
      fill.addColorStop(0, rgba(this.color, alpha * 0.55, 30))
      fill.addColorStop(1, rgba(this.color, 0, 30))
      ctx.fillStyle = fill
      ctx.fill()
    })
  }

  drawBell(ctx, bellWidth, bellHeight, alpha) {
    const roof = bellHeight * 1.15
    const lip = bellHeight * 0.16

    this.bellPath(ctx, bellWidth, roof, lip)
    const shell = ctx.createRadialGradient(-bellWidth * 0.12, -roof * 0.7, 0, 0, -roof * 0.3, bellWidth * 0.75)
    shell.addColorStop(0, `rgba(255, 255, 255, ${0.16 + alpha * 0.3})`)
    shell.addColorStop(0.35, rgba(this.color, 0.16 + alpha * 0.5))
    shell.addColorStop(1, rgba(this.color, 0.04 + alpha * 0.15))
    ctx.fillStyle = shell
    ctx.fill()

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + alpha * 0.25})`
    ctx.lineWidth = 1
    ctx.stroke()

    // Inner rim of the bell, seen through the translucent dome
    ctx.beginPath()
    ctx.ellipse(0, -roof * 0.04, bellWidth * 0.4, roof * 0.12, 0, Math.PI, Math.PI * 2)
    ctx.strokeStyle = rgba(this.color, 0.1 + alpha * 0.35, 60)
    ctx.stroke()
  }

  draw(ctx, time, light) {
    const contract = Math.sin(time * this.pulseRate + this.pulsePhase)
    const scale = this.size * (0.92 + this.depth * 0.35)
    // The bell flattens and widens as it contracts, then relaxes
    const bellWidth = scale * (1 + contract * this.pulseAmount * 0.5)
    const bellHeight = scale * 0.7 * (1 - contract * this.pulseAmount * 0.7)
    const alpha = this.opacity * (light ? 1.9 : 1)

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'

    const halo = ctx.createRadialGradient(0, -bellHeight * 0.4, 0, 0, -bellHeight * 0.4, bellWidth * 1.3)
    halo.addColorStop(0, rgba(this.color, alpha * (light ? 0.14 : 0.3)))
    halo.addColorStop(1, rgba(this.color, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(0, -bellHeight * 0.4, bellWidth * 1.3, 0, Math.PI * 2)
    ctx.fill()

    this.drawTentacles(ctx, bellWidth, bellHeight, alpha, time)
    this.drawArms(ctx, bellWidth, bellHeight, alpha, time)
    this.drawBell(ctx, bellWidth, bellHeight, alpha)

    ctx.restore()
  }
}

/* ---------------------------------------------------------------------------
 * Marine snow — tiny particles drifting down through the water
 * ------------------------------------------------------------------------- */
class MarineSnow {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.x = rand(0, width)
    this.y = rand(0, height)
    this.radius = rand(0.5, 1.8)
    this.fall = rand(4, 12)
    this.phase = rand(0, Math.PI * 2)
    this.twinkle = rand(0.0006, 0.0016)
    this.alpha = rand(0.18, 0.5)
  }

  update(deltaTime, time) {
    const dt = deltaTime / 1000
    this.y += this.fall * dt
    this.x += Math.sin(time * 0.0004 + this.phase) * 4 * dt
    if (this.y > this.height + 4) {
      this.y = -4
      this.x = rand(0, this.width)
    }
  }

  draw(ctx, time, light) {
    const flicker = 0.65 + Math.sin(time * this.twinkle + this.phase) * 0.35
    const alpha = this.alpha * flicker * (light ? 0.55 : 1)
    ctx.fillStyle = light ? `rgba(40, 100, 170, ${alpha})` : `rgba(190, 230, 255, ${alpha})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ---------------------------------------------------------------------------
 * Anglerfish — a slow silhouette with a glowing lure
 * ------------------------------------------------------------------------- */
class Anglerfish {
  constructor(width, height) {
    this.seed = rand(0, 10_000)
    this.spawn(width, height, true)
  }

  spawn(width, height, initial = false) {
    this.width = width
    this.height = height
    this.length = rand(70, 96) * (width < 700 ? 0.75 : 1)
    this.direction = Math.random() < 0.5 ? 1 : -1
    this.speed = rand(12, 18)
    this.baseY = rand(height * 0.35, height * 0.8)
    this.x = initial ? rand(width * 0.15, width * 0.85) : this.direction > 0 ? -this.length * 2 : width + this.length * 2
    this.y = this.baseY
    this.wait = initial ? 0 : rand(6000, 16000)
  }

  update(deltaTime, time) {
    if (this.wait > 0) {
      this.wait -= deltaTime
      return
    }
    this.x += this.direction * this.speed * (deltaTime / 1000)
    this.y = this.baseY + Math.sin(time * 0.0005 + this.seed) * 10
    const margin = this.length * 2.5
    if (this.x < -margin || this.x > this.width + margin) this.spawn(this.width, this.height)
  }

  draw(ctx, time, light) {
    if (this.wait > 0) return
    const L = this.length
    const tailSwing = Math.sin(time * 0.004 + this.seed) * 0.06
    const lureSway = Math.sin(time * 0.0016 + this.seed) * L * 0.05
    const glow = 0.75 + Math.sin(time * 0.003 + this.seed) * 0.25

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.scale(this.direction, 1)
    ctx.rotate(Math.sin(time * 0.0005 + this.seed) * 0.05)

    // Body: big head and lower jaw, tapering to the tail
    ctx.beginPath()
    ctx.moveTo(L * 0.46, -L * 0.02)
    ctx.bezierCurveTo(L * 0.4, -L * 0.36, -L * 0.06, -L * 0.36, -L * 0.34, -L * 0.07)
    ctx.lineTo(-L * 0.54, -L * (0.22 + tailSwing))
    ctx.quadraticCurveTo(-L * 0.47, 0, -L * 0.54, L * (0.2 - tailSwing))
    ctx.lineTo(-L * 0.34, L * 0.07)
    ctx.bezierCurveTo(-L * 0.08, L * 0.3, L * 0.3, L * 0.33, L * 0.52, L * 0.15)
    ctx.lineTo(L * 0.3, L * 0.05)
    ctx.closePath()

    const body = ctx.createLinearGradient(0, -L * 0.35, 0, L * 0.3)
    if (light) {
      body.addColorStop(0, 'rgba(60, 100, 150, 0.2)')
      body.addColorStop(1, 'rgba(60, 100, 150, 0.08)')
    } else {
      body.addColorStop(0, 'rgba(46, 78, 124, 0.55)')
      body.addColorStop(1, 'rgba(12, 22, 44, 0.4)')
    }
    ctx.fillStyle = body
    ctx.fill()
    ctx.strokeStyle = light ? 'rgba(40, 90, 150, 0.28)' : 'rgba(150, 210, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Teeth along the open mouth
    ctx.strokeStyle = light ? 'rgba(40, 90, 150, 0.35)' : 'rgba(220, 240, 255, 0.4)'
    ctx.lineWidth = 0.9
    ctx.beginPath()
    for (let index = 0; index < 5; index += 1) {
      const t = index / 4
      const x = lerp(L * 0.32, L * 0.5, t)
      const y = lerp(L * 0.06, L * 0.15, t)
      ctx.moveTo(x, y)
      ctx.lineTo(x + L * 0.012, y - L * 0.05)
    }
    ctx.stroke()

    // Pectoral fin
    ctx.beginPath()
    ctx.moveTo(-L * 0.02, L * 0.08)
    ctx.quadraticCurveTo(-L * 0.16, L * 0.2, -L * 0.2, L * 0.1)
    ctx.quadraticCurveTo(-L * 0.12, L * 0.08, -L * 0.02, L * 0.08)
    ctx.fillStyle = light ? 'rgba(60, 100, 150, 0.16)' : 'rgba(110, 170, 230, 0.2)'
    ctx.fill()

    // Eye
    ctx.beginPath()
    ctx.arc(L * 0.27, -L * 0.13, L * 0.03, 0, Math.PI * 2)
    ctx.fillStyle = light ? 'rgba(40, 90, 150, 0.45)' : 'rgba(200, 235, 255, 0.55)'
    ctx.fill()

    // Illicium — the fishing-rod spine ending in the lure
    const lureX = L * 0.64 + lureSway
    const lureY = -L * 0.38 + Math.cos(time * 0.0016 + this.seed) * L * 0.03
    ctx.beginPath()
    ctx.moveTo(L * 0.18, -L * 0.3)
    ctx.quadraticCurveTo(L * 0.42, -L * 0.66, lureX, lureY)
    ctx.strokeStyle = light ? 'rgba(40, 90, 150, 0.35)' : 'rgba(150, 210, 255, 0.35)'
    ctx.lineWidth = 1.1
    ctx.stroke()

    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'
    const halo = ctx.createRadialGradient(lureX, lureY, 0, lureX, lureY, L * (light ? 0.22 : 0.42))
    halo.addColorStop(0, rgba(LURE, (light ? 0.45 : 0.55) * glow))
    halo.addColorStop(0.25, rgba(LURE, (light ? 0.12 : 0.18) * glow))
    halo.addColorStop(1, rgba(LURE, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(lureX, lureY, L * 0.42, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = light ? `rgba(20, 170, 150, ${0.8 * glow})` : `rgba(235, 255, 248, ${0.9 * glow})`
    ctx.beginPath()
    ctx.arc(lureX, lureY, L * 0.028, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

/* ---------------------------------------------------------------------------
 * Squid — jets forward mantle-first in pulses, arms and tentacles trailing
 * ------------------------------------------------------------------------- */
const SQUID = { r: 255, g: 150, b: 196 }

class Squid {
  constructor(width, height) {
    this.seed = rand(0, 10_000)
    this.spawn(width, height, true)
  }

  spawn(width, height, initial = false) {
    this.width = width
    this.height = height
    this.length = rand(84, 108) * (width < 700 ? 0.7 : 1)
    const fromLeft = Math.random() < 0.5
    // Mostly sideways with a gentle climb or dive
    this.heading = (fromLeft ? 0 : Math.PI) + rand(-0.35, 0.35)
    this.x = initial ? rand(width * 0.2, width * 0.8) : fromLeft ? -this.length * 3 : width + this.length * 3
    this.y = initial ? rand(height * 0.2, height * 0.8) : rand(height * 0.25, height * 0.75)
    this.pulseRate = rand(0.00055, 0.0008)
    this.pulsePhase = rand(0, 1)
    this.wait = initial ? 0 : rand(8000, 20000)
    this.arms = Array.from({ length: 8 }, (_, index) => ({
      offset: (index - 3.5) / 3.5,
      length: rand(0.55, 0.75),
      phase: rand(0, Math.PI * 2),
    }))
  }

  // 0 → 1 over one swim cycle: a quick squeeze (jet), then a long glide
  cycle(time) {
    return (time * this.pulseRate + this.pulsePhase) % 1
  }

  update(deltaTime, time) {
    if (this.wait > 0) {
      this.wait -= deltaTime
      return
    }
    const t = this.cycle(time)
    const jet = t < 0.2 ? Math.sin((t / 0.2) * Math.PI) : 0
    const glide = t >= 0.2 ? 1 - (t - 0.2) / 0.8 : 0
    const speed = 12 + jet * 95 + glide * 26
    this.heading += noise1D(this.seed, time * 0.00012) * 0.0025
    this.x += Math.cos(this.heading) * speed * (deltaTime / 1000)
    this.y += Math.sin(this.heading) * speed * (deltaTime / 1000)

    const margin = this.length * 3.5
    const outside = this.x < -margin || this.x > this.width + margin || this.y < -margin || this.y > this.height + margin
    if (outside) this.spawn(this.width, this.height)
  }

  draw(ctx, time, light) {
    if (this.wait > 0) return
    const L = this.length
    const t = this.cycle(time)
    const squeeze = t < 0.2 ? Math.sin((t / 0.2) * Math.PI) : 0
    // Arms snap together during the jet and slowly fan out while gliding
    const spread = t < 0.2 ? 1 - squeeze * 0.7 : 0.3 + Math.min(1, (t - 0.2) / 0.5) * 0.7
    const W = L * 0.16 * (1 - squeeze * 0.18)
    const alpha = light ? 0.46 : 0.42

    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.heading)
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'

    const halo = ctx.createRadialGradient(L * 0.15, 0, 0, L * 0.15, 0, L * 0.8)
    halo.addColorStop(0, rgba(SQUID, light ? 0.08 : 0.14))
    halo.addColorStop(1, rgba(SQUID, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(L * 0.15, 0, L * 0.8, 0, Math.PI * 2)
    ctx.fill()

    // Arms and the two long feeding tentacles trail behind the head
    ctx.lineCap = 'round'
    const baseX = -L * 0.2
    this.arms.forEach((arm) => {
      const length = L * arm.length
      const endY = arm.offset * W * (0.6 + spread * 1.6)
      const wave = Math.sin(time * 0.004 + arm.phase) * W * 0.7 * spread
      const fade = ctx.createLinearGradient(baseX, 0, baseX - length, 0)
      fade.addColorStop(0, rgba(SQUID, alpha * 0.9, 20))
      fade.addColorStop(1, rgba(SQUID, 0, 20))
      ctx.strokeStyle = fade
      ctx.lineWidth = L * 0.022
      ctx.beginPath()
      ctx.moveTo(baseX, arm.offset * W * 0.45)
      ctx.bezierCurveTo(baseX - length * 0.35, endY * 0.4 - wave, baseX - length * 0.7, endY * 0.8 + wave, baseX - length, endY + wave * 0.4)
      ctx.stroke()
    })
    for (const side of [-1, 1]) {
      const length = L * 1.15
      const sway = Math.sin(time * 0.0025 + this.seed + side) * W * 0.5
      const endX = baseX - length
      const endY = side * W * (0.3 + spread * 0.6) + sway
      ctx.strokeStyle = rgba(SQUID, alpha * 0.55, 20)
      ctx.lineWidth = L * 0.012
      ctx.beginPath()
      ctx.moveTo(baseX, side * W * 0.15)
      ctx.quadraticCurveTo(baseX - length * 0.55, side * W * 0.2 - sway, endX, endY)
      ctx.stroke()
      // Club at the tip
      ctx.fillStyle = rgba(SQUID, alpha * 0.8, 30)
      ctx.beginPath()
      ctx.ellipse(endX, endY, L * 0.05, L * 0.018, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Head with a pair of large eyes
    ctx.fillStyle = rgba(SQUID, alpha * 0.85)
    ctx.beginPath()
    ctx.ellipse(-L * 0.13, 0, L * 0.1, W * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()
    for (const side of [-1, 1]) {
      ctx.fillStyle = light ? 'rgba(40, 70, 120, 0.55)' : 'rgba(235, 245, 255, 0.8)'
      ctx.beginPath()
      ctx.arc(-L * 0.11, side * W * 0.42, L * 0.028, 0, Math.PI * 2)
      ctx.fill()
    }

    // Mantle: long and tapered toward the tip, which leads the way
    ctx.beginPath()
    ctx.moveTo(-L * 0.04, -W)
    ctx.bezierCurveTo(L * 0.2, -W * 1.05, L * 0.45, -W * 0.55, L * 0.62, 0)
    ctx.bezierCurveTo(L * 0.45, W * 0.55, L * 0.2, W * 1.05, -L * 0.04, W)
    ctx.quadraticCurveTo(-L * 0.08, 0, -L * 0.04, -W)
    const mantle = ctx.createLinearGradient(-L * 0.05, 0, L * 0.62, 0)
    mantle.addColorStop(0, rgba(SQUID, alpha))
    mantle.addColorStop(1, rgba(SQUID, alpha * 0.55, 40))
    ctx.fillStyle = mantle
    ctx.fill()
    ctx.strokeStyle = light ? rgba(SQUID, 0.45, -90) : `rgba(255, 255, 255, ${alpha * 0.5})`
    ctx.lineWidth = 0.9
    ctx.stroke()

    // Fins near the tip, rippling gently
    const ripple = Math.sin(time * 0.006 + this.seed) * W * 0.25
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(L * 0.34, side * W * 0.72)
      ctx.quadraticCurveTo(L * 0.44, side * (W * 1.6 + ripple), L * 0.6, side * W * 0.12)
      ctx.closePath()
      ctx.fillStyle = rgba(SQUID, alpha * 0.6, 30)
      ctx.fill()
    }

    // Glowing photophores along the mantle
    for (let index = 0; index < 5; index += 1) {
      const twinkle = 0.6 + Math.sin(time * 0.003 + index * 1.7 + this.seed) * 0.4
      ctx.fillStyle = light ? `rgba(200, 60, 130, ${0.4 * twinkle})` : `rgba(255, 225, 240, ${0.85 * twinkle})`
      ctx.beginPath()
      ctx.arc(L * (0.02 + index * 0.1), 0, L * 0.012, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

/* ---------------------------------------------------------------------------
 * Lanternfish — a small school with glowing photophores
 * ------------------------------------------------------------------------- */
class LanternSchool {
  constructor(width, height) {
    this.spawn(width, height, true)
  }

  spawn(width, height, initial = false) {
    this.width = width
    this.height = height
    this.direction = Math.random() < 0.5 ? 1 : -1
    this.speed = rand(34, 50)
    this.baseY = rand(height * 0.15, height * 0.7)
    this.x = initial ? rand(0, width) : this.direction > 0 ? -120 : width + 120
    this.y = this.baseY
    this.phase = rand(0, Math.PI * 2)
    this.wait = initial ? 0 : rand(9000, 22000)
    this.fish = Array.from({ length: 6 + Math.floor(rand(0, 5)) }, () => ({
      dx: rand(-110, 30),
      dy: rand(-36, 36),
      size: rand(16, 24),
      phase: rand(0, Math.PI * 2),
    }))
  }

  update(deltaTime, time) {
    if (this.wait > 0) {
      this.wait -= deltaTime
      return
    }
    this.x += this.direction * this.speed * (deltaTime / 1000)
    this.y = this.baseY + Math.sin(time * 0.0007 + this.phase) * 22
    if (this.x < -160 || this.x > this.width + 160) this.spawn(this.width, this.height)
  }

  draw(ctx, time, light) {
    if (this.wait > 0) return
    ctx.save()
    this.fish.forEach((fish) => {
      const wobble = Math.sin(time * 0.003 + fish.phase)
      const x = this.x + fish.dx * this.direction + wobble * 3
      const y = this.y + fish.dy + Math.cos(time * 0.002 + fish.phase) * 4
      const s = fish.size

      ctx.save()
      ctx.translate(x, y)
      ctx.scale(this.direction, 1)
      ctx.rotate(wobble * 0.06)

      ctx.globalCompositeOperation = 'source-over'
      ctx.beginPath()
      ctx.moveTo(s * 0.6, 0)
      ctx.quadraticCurveTo(s * 0.2, -s * 0.3, -s * 0.4, -s * 0.05)
      ctx.lineTo(-s * 0.7, -s * (0.25 + wobble * 0.08))
      ctx.lineTo(-s * 0.6, 0)
      ctx.lineTo(-s * 0.7, s * (0.25 - wobble * 0.08))
      ctx.lineTo(-s * 0.4, s * 0.05)
      ctx.quadraticCurveTo(s * 0.2, s * 0.3, s * 0.6, 0)
      ctx.fillStyle = light ? 'rgba(50, 95, 150, 0.26)' : 'rgba(120, 170, 225, 0.34)'
      ctx.fill()

      // Row of photophores along the belly
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter'
      ctx.fillStyle = light ? 'rgba(20, 150, 200, 0.55)' : 'rgba(150, 235, 255, 0.85)'
      for (let index = 0; index < 3; index += 1) {
        ctx.beginPath()
        ctx.arc(s * (0.3 - index * 0.25), s * 0.12, s * 0.05, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    })
    ctx.restore()
  }
}

const JellyfishBackground = ({ theme = 'dark', paused = false }) => {
  const canvasRef = useRef(null)
  const animationRef = useRef(0)
  const lastTimeRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const profileRef = useRef(null)
  const creaturesRef = useRef({ snow: [], back: [], front: [] })
  const backgroundCanvasRef = useRef(null)
  const lightRef = useRef(theme === 'light')
  const pausedRef = useRef(paused)
  const frozenTimeRef = useRef(0)
  const redrawBackgroundRef = useRef(null)
  const redrawFrameRef = useRef(null)

  useEffect(() => {
    lightRef.current = theme === 'light'
    redrawBackgroundRef.current?.()
    redrawFrameRef.current?.()
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

    const drawBackground = (backgroundCtx, width, height, light) => {
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
        sky.addColorStop(0, '#03081a')
        sky.addColorStop(0.5, '#040a18')
        sky.addColorStop(1, '#01020a')
        backgroundCtx.fillStyle = sky
        backgroundCtx.fillRect(0, 0, width, height)

        const topGlow = backgroundCtx.createRadialGradient(width * 0.22, height * 0.1, 0, width * 0.22, height * 0.1, width * 0.72)
        topGlow.addColorStop(0, 'rgba(92, 197, 255, 0.1)')
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

        // Faint, slanted light shafts from the surface
        for (let index = 0; index < 3; index += 1) {
          const topX = width * (0.14 + index * 0.3)
          const shaft = backgroundCtx.createLinearGradient(0, 0, 0, height * 0.85)
          shaft.addColorStop(0, 'rgba(127, 220, 255, 0.045)')
          shaft.addColorStop(1, 'rgba(127, 220, 255, 0)')
          backgroundCtx.fillStyle = shaft
          backgroundCtx.beginPath()
          backgroundCtx.moveTo(topX, 0)
          backgroundCtx.lineTo(topX + 70 + index * 20, 0)
          backgroundCtx.lineTo(topX + 260 + index * 30, height * 0.85)
          backgroundCtx.lineTo(topX + 120, height * 0.85)
          backgroundCtx.closePath()
          backgroundCtx.fill()
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

      const backgroundCtx = backgroundCanvas.getContext('2d', { alpha: true })
      if (backgroundCtx) {
        backgroundCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawBackground(backgroundCtx, width, height, lightRef.current)
      }
    }

    redrawBackgroundRef.current = resizeCanvas

    const createCreatures = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const profile = profileRef.current ?? getProfile(reducedMotionRef.current)

      const jellies = Array.from({ length: profile.count }, () => new Jellyfish(width, height)).sort(
        (left, right) => left.depth - right.depth
      )
      const cut = Math.ceil(jellies.length / 2)
      // Draw order: snow, distant jellies, fish, near jellies
      creaturesRef.current = {
        snow: Array.from({ length: profile.snow }, () => new MarineSnow(width, height)),
        back: jellies.slice(0, cut),
        front: [
          ...(profile.fish ? [new LanternSchool(width, height), new Anglerfish(width, height), new Squid(width, height)] : []),
          ...jellies.slice(cut),
        ],
      }
    }

    const renderFrame = (time, deltaTime) => {
      const width = window.innerWidth
      const height = window.innerHeight
      const backgroundCanvas = backgroundCanvasRef.current
      const frozen = pausedRef.current
      const light = lightRef.current
      const drawTime = frozen ? frozenTimeRef.current : time

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)
      if (backgroundCanvas) ctx.drawImage(backgroundCanvas, 0, 0, width, height)

      const { snow, back, front } = creaturesRef.current
      ;[snow, back, front].forEach((group) => {
        group.forEach((creature) => {
          if (!frozen) creature.update(deltaTime, time)
          ctx.globalCompositeOperation = 'source-over'
          creature.draw(ctx, drawTime, light)
        })
      })
    }

    redrawFrameRef.current = () => {
      if (profileRef.current?.frameInterval === Infinity) renderFrame(performance.now(), 0)
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

      // Cap the step so a backgrounded tab doesn't make everything jump
      const deltaTime = lastTimeRef.current ? Math.min(time - lastTimeRef.current, 100) : profile.frameInterval
      lastTimeRef.current = time

      renderFrame(time, deltaTime)
      animationRef.current = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      syncProfile()
      resizeCanvas()
      createCreatures()
      redrawFrameRef.current?.()
    }

    syncProfile()
    resizeCanvas()
    createCreatures()

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
