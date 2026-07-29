import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type-check every `<Link href>` and `router.push()` against the routes that
  // actually exist. Next writes the route union into `.next/types` during
  // typegen. Non-literal hrefs need `as Route` — see the frontend-route skill.
  typedRoutes: true,
};

export default nextConfig;
