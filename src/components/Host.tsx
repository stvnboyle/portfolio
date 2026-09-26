/** The site's name in a shell prompt: the full host, or `~` on phones, like a shell's home directory. */
export function Host() {
  return (
    <>
      <span className="nav__host">stevenboyle.dev</span>
      <span className="nav__home" aria-hidden>
        ~
      </span>
    </>
  );
}
