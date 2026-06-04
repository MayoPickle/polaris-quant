import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Polaris Quant",
    short_name: "Polaris",
    description:
      "A mobile-ready dashboard for monitoring quantitative trading strategies.",
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
        name: "Overview",
        short_name: "Overview",
        description: "Open the dashboard overview.",
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
        name: "Strategies",
        short_name: "Strategies",
        description: "Open strategy configuration and backtests.",
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
        name: "Portfolio",
        short_name: "Portfolio",
        description: "Open account balances and positions.",
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
        name: "Orders",
        short_name: "Orders",
        description: "Open order history.",
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
        name: "Market",
        short_name: "Market",
        description: "Open market status and quote lookup.",
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
