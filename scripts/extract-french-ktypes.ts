import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "../lib/logger";

if (existsSync(".env")) {
    try { (process as any).loadEnvFile(".env"); } catch {}
}
if (existsSync(".env.local")) {
    try { (process as any).loadEnvFile(".env.local"); } catch {}
}

interface KTypeSeedItem {
    vehicleId: number;
    manufacturerName: string;
    modelName: string;
    typeEngineName: string;
}

async function main() {
    const startTime = Date.now();
    logger.info("French fleet K-Type extraction process initiated", {
        module: "ktype-extractor",
        action: "start",
    });

    const kTypes: KTypeSeedItem[] = [
        { vehicleId: 199512, manufacturerName: "FIAT", modelName: "PUNTO EVO (199_)", typeEngineName: "1.4" },
        { vehicleId: 101412, manufacturerName: "PEUGEOT", modelName: "307 (3A/C)", typeEngineName: "1.6 HDi 110" },
        { vehicleId: 100466, manufacturerName: "RENAULT", modelName: "CLIO IV (BH_)", typeEngineName: "1.5 dCi 90" },
        { vehicleId: 100860, manufacturerName: "CITROEN", modelName: "C3 III (SX)", typeEngineName: "1.2 PureTech 82" },
        { vehicleId: 76908, manufacturerName: "VW", modelName: "UP! (121, 122, BL1, BL2)", typeEngineName: "1.0" },
        { vehicleId: 58586, manufacturerName: "PEUGEOT", modelName: "208 I (CA_, CC_)", typeEngineName: "1.2 VTi" },
        { vehicleId: 58587, manufacturerName: "RENAULT", modelName: "MEGANE III (BZ0/1_)", typeEngineName: "1.5 dCi" },
    ];

    const outDir = join(process.cwd(), "data");
    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }

    const filePath = join(outDir, "active_ktypes.json");
    writeFileSync(filePath, JSON.stringify(kTypes, null, 2), "utf-8");

    const durationMs = Date.now() - startTime;
    logger.info("French fleet K-Type extraction process completed", {
        module: "ktype-extractor",
        action: "completed",
        count: kTypes.length,
        filePath,
        durationMs,
    });
}

main().catch((err) => {
    logger.error("French fleet K-Type extraction process failed", {
        module: "ktype-extractor",
        action: "fatal_error",
        error: err,
    });
    process.exit(1);
});
