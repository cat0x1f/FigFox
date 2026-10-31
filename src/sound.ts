/**
 * Synthesised sound, no audio files.
 *
 * Browsers only let audio start after a gesture, and a jump is one, so the
 * context is created lazily the first time the fox actually leaves the ground.
 */
export class JumpSound {
  private ctx: AudioContext | null = null

  play(): void {
    const ctx = this.context()
    if (!ctx) return

    const start = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    // A short rising blip, the shape of the dino's own press sound.
    osc.type = 'square'
    osc.frequency.setValueAtTime(440, start)
    osc.frequency.exponentialRampToValueAtTime(680, start + 0.055)

    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.03, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11)

    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.12)
  }

  private context(): AudioContext | null {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}
