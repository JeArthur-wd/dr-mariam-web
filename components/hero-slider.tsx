'use client'

import { useEffect, useState } from 'react'

type Slide = { src: string; alt: string; position?: string }

const SLIDE_MS = 6000

/** Crossfading photo background for a hero section, matching the live site's home slider. */
export function HeroSlider({ slides, className = '', children }: { slides: readonly Slide[]; className?: string; children: React.ReactNode }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || slides.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % slides.length), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [active, paused, slides.length])

  return (
    <section
      className={`photo-hero ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="photo-hero-slides" aria-hidden="true">
        {slides.map((slide, index) => (
          <img
            key={slide.src}
            src={slide.src}
            alt=""
            className={index === active ? 'active' : ''}
            style={{ objectPosition: slide.position ?? 'center' }}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
          />
        ))}
      </div>
      <div className="photo-hero-content">{children}</div>
      {slides.length > 1 ? (
        <div className="photo-hero-dots" role="group" aria-label="Choose background photo">
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              className={index === active ? 'active' : ''}
              aria-label={`Show photo ${index + 1}: ${slide.alt}`}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
