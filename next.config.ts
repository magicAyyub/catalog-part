import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    poweredByHeader: false,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "*.your-objectstorage.com",
            },
        ],
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=31536000; includeSubDomains",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "SAMEORIGIN",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
                    },
                    {
                        key: "Content-Security-Policy-Report-Only",
                        value: "default-src 'self'; img-src 'self' https://*.your-objectstorage.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
