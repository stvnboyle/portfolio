import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { profile } from "@/data/profile";
import "./globals.css";

const title = `${profile.fullName} — ${profile.roles.join(" / ")}`;
const description = `${profile.roles.join(", ")} in ${profile.location}. ${profile.tagline}`;

export const metadata: Metadata = {
  // Resolves relative URLs in metadata (Open Graph, canonical) against the real domain.
  metadataBase: new URL(profile.site),
  title,
  description,
  applicationName: "Steven Boyle",
  authors: [{ name: profile.fullName }],
  keywords: [
    "Steven Boyle",
    "Tech Lead",
    "Engineering Manager",
    "TypeScript",
    "React",
    "Next.js",
    "Newcastle upon Tyne",
    "agentic engineering",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    type: "profile",
    locale: "en_GB",
    siteName: profile.fullName,
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={GeistMono.variable}>
      <body>
        <a className="skip-link" href="#top">
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          // Structured data so search engines read the page as a person, not a toy.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: profile.fullName,
              url: profile.site,
              jobTitle: profile.roles.join(" / "),
              email: `mailto:${profile.email}`,
              address: { "@type": "PostalAddress", addressLocality: profile.location },
              sameAs: [profile.links.linkedin, profile.links.medium],
              description: profile.intro,
            }),
          }}
        />
      </body>
    </html>
  );
}
