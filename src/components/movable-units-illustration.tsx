export function MovableUnitsIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 21 32 10 57 21 32 33Z M6 21 9 45 32 57 32 33 M57 21 55 46 32 57"/>
      <path d="M16 17 23 14 47 25 40 29Z" stroke="var(--spot-accent, currentColor)" fill="var(--spot-accent, currentColor)" fillOpacity=".18"/>
      <path d="M40 37 44 31 50 35 49 44 39 48Z" stroke="var(--spot-accent, currentColor)" fill="var(--spot-accent, currentColor)" fillOpacity=".18"/>
      <path d="M44 34 43 28"/>
    </svg>
  );
}
