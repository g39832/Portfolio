import { useEffect, useRef, useState } from 'react'

const supportsObserver = typeof IntersectionObserver !== 'undefined'

/**
 * Reveals its children with a subtle entrance animation the first time they
 * scroll into view. Variants: 'up' (default), 'left', 'right', 'zoom'.
 */
const Reveal = ({ children, className = '', variant = 'up', delay = 0, ...rest }) => {
  const ref = useRef(null)
  const [visible, setVisible] = useState(() => !supportsObserver)

  useEffect(() => {
    const element = ref.current
    if (!element || visible) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div
      ref={ref}
      className={`reveal reveal-${variant}${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </div>
  )
}

export default Reveal
