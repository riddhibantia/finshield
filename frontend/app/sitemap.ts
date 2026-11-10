import type { MetadataRoute } from "next";

const SITE_URL = "https://finshield-demo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/command-center",
    "/performance",
    "/architecture",
    "/privacy/U-00001",
    "/glossary",
    "/paypal",
    "/agent",
  ];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
