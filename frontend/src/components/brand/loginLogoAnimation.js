import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

export function animateLoginLogo(root, onComplete) {
  const context = gsap.context(() => {
    const timeline = gsap.timeline({ onComplete });
    gsap.set('[data-logo-outline]', { opacity: 1 });
    timeline.fromTo('[data-logo-stroke]', { drawSVG: '0% 0%' }, {
      drawSVG: '0% 100%', duration: 2.8, ease: 'none',
    }, 0);
    timeline.to('[data-logo-flood]', { attr: { y: 0 }, duration: 1.25, ease: 'power1.inOut' }, 2.8);
    // Move the trailing edge forward to the end, rather than unwinding the path.
    timeline.to('[data-logo-stroke]', { drawSVG: '100% 100%', duration: 1.1, ease: 'none' }, 3.55);
    // Let the finished mark settle before handing over to the dashboard.
    timeline.to(root, { opacity: 0, duration: .3, ease: 'power1.out' }, 4.7);
  }, root);
  return () => context.revert();
}
