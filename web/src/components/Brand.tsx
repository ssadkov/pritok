export function Brand({ subtitle }: { subtitle: string }) {
  return (
    <a className="brand" href="/" aria-label={`PriTok — ${subtitle}`}>
      {/* The wordmark labels the link; the separate mark is decorative. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/pritok-mark.svg" alt="" width={22} height={24} />
      <span className="brand-wordmark"><span className="brand-pri">Pri</span><span>Tok</span></span>
      <small>{subtitle}</small>
    </a>
  );
}
