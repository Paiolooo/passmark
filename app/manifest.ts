import type { MetadataRoute } from "next";

// "Add to Home Screen": PassMark's own name, colours and icons (no IE marks).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PassMark — Grade & GPA calculator",
    short_name: "PassMark",
    description: "The grade you need on every exam, and your GPA, live. For IE University students.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FAF8F4",
    theme_color: "#0F5C4A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
