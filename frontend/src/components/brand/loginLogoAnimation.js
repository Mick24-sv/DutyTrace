import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(DrawSVGPlugin);

export function animateLoginLogo(root, onComplete) {
  const context = gsap.context(() => {
    const timeline = gsap.timeline({ onComplete });
    gsap.set('[data-logo-outline]', { opacity: 1 });
    timeline.fromTo('[data-logo-stroke]', { drawSVG: '0% 0%' }, {
      drawSVG: '0% 100%', duration: 1.2, ease: 'power1.inOut',
    }, 0);
    timeline.to('[data-logo-flood]', { attr: { y: 0 }, duration: .35, ease: 'power2.inOut' }, 1.2);
    // Move the trailing edge forward to the end, rather than unwinding the path.
    timeline.to('[data-logo-stroke]', { drawSVG: '100% 100%', duration: .3, ease: 'power2.inOut' }, 1.4);
    timeline.to(root, { opacity: 0, duration: .15, ease: 'power1.out' }, 1.7);
  }, root);
  return () => context.revert();
}
