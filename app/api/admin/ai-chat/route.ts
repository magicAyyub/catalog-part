import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { CHAT_API_KEY, CHAT_API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    if (auth.role !== "admin") {
        return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
    }

    let message: string;
    try {
        const body = await req.json();
        message = body?.message;
    } catch {
        return NextResponse.json({ error: "Format de requête invalide." }, { status: 400 });
    }

    if (typeof message !== "string" || !message.trim()) {
        return NextResponse.json({ error: "Le message ne peut pas être vide." }, { status: 400 });
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (CHAT_API_KEY) {
            headers["Authorization"] = `Bearer ${CHAT_API_KEY}`;
        }

        const res = await fetch(CHAT_API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({ message: message.trim() }),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            logger.error("AI API returned error", { status: res.status, error: errText });
            return NextResponse.json(
                { error: `Erreur du serveur IA (${res.status}).` },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json({
            response: data.response ?? data.reply ?? data.message ?? "Aucune réponse de l'IA.",
            escalated_to_human: Boolean(data.escalated_to_human),
            status: data.status ?? "success",
        });
    } catch (err) {
        logger.error("Failed to reach AI API server", { error: String(err), url: CHAT_API_URL });
        return NextResponse.json(
            { error: "Impossible de contacter le serveur d'orchestration IA." },
            { status: 502 }
        );
    }
}
