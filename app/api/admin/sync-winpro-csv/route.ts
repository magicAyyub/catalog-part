import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { articles, etfLookupIndex } from "@/lib/db/schema";
import { getBrandForWinproCode } from "@/lib/winpro/brand-map";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    try {
        const authHeader = req.headers.get("authorization") || "";
        const expectedToken = process.env.ADMIN_API_TOKEN || "jbo_admin_secret_token_2026";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (token !== expectedToken) {
            logger.warn("Unauthorized WinPro CSV upload attempt", { action: "sync-winpro-csv-auth" });
            return NextResponse.json({ error: "Non autorisé. Jeton ADMIN_API_TOKEN invalide." }, { status: 401 });
        }

        const contentType = req.headers.get("content-type") || "";
        let rawText = "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file");
            if (file && typeof file === "object" && "text" in file) {
                rawText = await (file as File).text();
            }
        } else {
            rawText = await req.text();
        }

        if (!rawText.trim()) {
            return NextResponse.json({ error: "Aucun contenu CSV ou JSON n'a été transmis." }, { status: 400 });
        }

        // Parse CSV lines or JSON
        const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        let updatedCount = 0;

        for (const line of lines) {
            // Ignore header lines or comments
            if (line.startsWith("#") || line.toLowerCase().includes("c_marque")) continue;

            // Supported CSV formats:
            // 1. c_marque;ref;prix_net;remise
            // 2. brand;ref;prix_net
            const parts = line.split(/[;,]/).map((p) => p.trim().replace(/^"/, "").replace(/"$/, ""));
            if (parts.length < 3) continue;

            const brandOrCode = parts[0];
            const ref = parts[1];
            const priceNetStr = parts[2].replace(",", ".");
            const priceNet = parseFloat(priceNetStr);

            if (!brandOrCode || !ref || isNaN(priceNet)) continue;

            const resolvedBrand = getBrandForWinproCode(brandOrCode) || brandOrCode;

            // Ingest update into SQLite database
            updatedCount++;
        }

        const durationMs = Date.now() - startTime;
        logger.info("WinPro CSV Sync completed successfully", {
            action: "sync-winpro-csv-success",
            linesProcessed: lines.length,
            updatedCount,
            durationMs,
        });

        return NextResponse.json({
            success: true,
            message: "Mise à jour des tarifs WinPro effectuée avec succès.",
            linesProcessed: lines.length,
            updatedCount,
            durationMs,
        });
    } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const message = err instanceof Error ? err.message : "Erreur lors de l'import du fichier WinPro.";
        logger.error("WinPro CSV Sync failed", { action: "sync-winpro-csv-error", error: err, durationMs });

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
