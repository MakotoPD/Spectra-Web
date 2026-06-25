import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Animates every [data-reveal] element in the DOM using ScrollTrigger.
// Called once after the app mounts so all static markup is covered.
// The v-reveal directive handles dynamically-mounted components individually.
function initReveal() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]')

  if (reduce) {
    gsap.set([...els], { clearProps: 'all', opacity: 1, y: 0 })
    return
  }

  els.forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 34 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      }
    )
  })
}

// Registers GSAP + ScrollTrigger and a global `v-reveal` directive used to
// fade/slide elements in as they scroll into view. A `.gsap` class is added to
// <html> so reveal targets start hidden (no flash) only when JS is available.
export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) {
    gsap.registerPlugin(ScrollTrigger)
    document.documentElement.classList.add('gsap')
  }

  nuxtApp.vueApp.directive('reveal', {
    getSSRProps: () => ({}),
    mounted(el: HTMLElement, binding) {
      if (!import.meta.client) return

      const { delay = 0, y = 34, duration = 0.7 } = binding.value || {}

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        gsap.set(el, { clearProps: 'all', opacity: 1, y: 0 })
        return
      }

      gsap.fromTo(
        el,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true }
        }
      )
    }
  })

  // After the app is fully mounted, wire up all [data-reveal] elements
  // that were rendered as static HTML (not through the v-reveal directive).
  nuxtApp.hook('app:mounted', () => {
    initReveal()
  })

  return { provide: { gsap, ScrollTrigger } }
})

