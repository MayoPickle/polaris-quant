import type { MetadataRoute } from "next";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale } from "@/lib/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getServerLocale();
  const t = getDictionary(locale);

  return {
    name: t.app.name,
    short_name: "Polaris",
    description: t.manifest.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/polaris-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/polaris-monochrome-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "monochrome",
      },
    ],
    shortcuts: [
      {
        name: t.nav.overview,
        short_name: t.nav.overview,
        description: t.manifest.shortcuts.overview,
        url: "/",
        icons: [
          {
            src: "/icons/shortcut-overview-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: t.nav.strategies,
        short_name: t.nav.strategies,
        description: t.manifest.shortcuts.strategies,
        url: "/strategies",
        icons: [
          {
            src: "/icons/shortcut-strategies-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: t.nav.portfolio,
        short_name: t.nav.portfolio,
        description: t.manifest.shortcuts.portfolio,
        url: "/portfolio",
        icons: [
          {
            src: "/icons/shortcut-portfolio-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: t.nav.orders,
        short_name: t.nav.orders,
        description: t.manifest.shortcuts.orders,
        url: "/orders",
        icons: [
          {
            src: "/icons/shortcut-orders-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
      {
        name: t.nav.market,
        short_name: t.nav.market,
        description: t.manifest.shortcuts.market,
        url: "/market",
        icons: [
          {
            src: "/icons/shortcut-market-96.png",
            sizes: "96x96",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
