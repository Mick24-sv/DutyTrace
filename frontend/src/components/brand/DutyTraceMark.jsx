import { useId } from 'react';

// A small, drawable vector interpretation of the existing D / clock / check mark.
// Keep the fill and outline as separate layers so DrawSVG can retract the stroke
// without erasing the completed blue mark.
const RIBBON = 'M44 36H122C179 36 207 70 207 121C207 172 178 204 122 204H44V164H120C150 164 166 150 166 121C166 92 150 77 120 77H44Z';
const CHECK = 'M119 153C112 146 102 147 96 154C90 161 91 171 98 178L136 216C142 222 151 222 157 215L222 140C228 133 227 123 220 117C213 111 203 112 197 119L145 179Z';

export default function DutyTraceMark() {
  const id = useId().replace(/:/g, '');
  const blue = `${id}-blue`;
  const flood = `${id}-flood`;
  return <svg className="login-transition-mark" viewBox="0 0 256 256" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={blue} x1="48" y1="40" x2="203" y2="210" gradientUnits="userSpaceOnUse"><stop stopColor="#26d5f2" /><stop offset=".48" stopColor="#0877fa" /><stop offset="1" stopColor="#0751d8" /></linearGradient>
      <clipPath id={flood}><rect data-logo-flood x="0" y="256" width="256" height="256" /></clipPath>
    </defs>
    <g clipPath={`url(#${flood})`}>
      <path d={RIBBON} fill={`url(#${blue})`} />
      <path d="M44 36L88 82L62 113L44 95Z" fill="#edf5ff" />
      <path d="M44 140L84 160L44 204Z" fill="#d7e8ff" />
      <circle cx="121" cy="126" r="55" fill="#082c68" />
      <circle cx="121" cy="126" r="45" fill="white" />
      <path d="M121 91V98M91 103L96 108M86 126H93M94 151L99 146M121 126L143 105" stroke="#082c68" strokeWidth="6" strokeLinecap="round" />
      <circle cx="121" cy="126" r="8" fill="#082c68" />
      <path d={CHECK} fill={`url(#${blue})`} stroke="white" strokeWidth="5" strokeLinejoin="round" />
    </g>
    <g data-logo-outline stroke="#0866e8" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0 }}>
      <path data-logo-stroke d={RIBBON} />
      <path data-logo-stroke d="M121 71A55 55 0 1 1 120.999 71" />
      <path data-logo-stroke d={CHECK} />
    </g>
  </svg>;
}
