"use client";

import { useState, useRef, useEffect } from "react";
import { Send, RotateCcw, AlertCircle, UserCheck } from "lucide-react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ChatMessage {
    id: string;
    sender: "user" | "assistant";
    text: string;
    escalatedToHuman?: boolean;
    timestamp: string;
}

interface ChatInterfaceProps {
    userDisplayName: string;
}

/**
 * Custom renderer to format Markdown text into elegant, readable HTML elements.
 */
function FormattedMessage({ text }: { text: string }) {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let listItems: string[] = [];
    let keyIdx = 0;

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`ul-${keyIdx++}`} className="my-2 space-y-1.5 pl-4 list-disc text-sm text-ink">
                    {listItems.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                            {renderInlineFormatting(item)}
                        </li>
                    ))}
                </ul>
            );
            listItems = [];
        }
    };

    const flushTable = () => {
        if (tableHeaders.length > 0) {
            elements.push(
                <div key={`table-${keyIdx++}`} className="my-3 overflow-x-auto rounded-xl border border-stroke bg-white shadow-2xs">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b border-stroke bg-muted/40 font-bold text-ink">
                                {tableHeaders.map((h, i) => (
                                    <th key={i} className="px-3 py-2.5">
                                        {renderInlineFormatting(h.trim())}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stroke/60 bg-white">
                            {tableRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-muted/20 transition-colors">
                                    {row.map((cell, cIdx) => {
                                        const cleanCell = cell.trim();
                                        const isPrice = /^\d+[\s\u202f]*[€$]/.test(cleanCell) || /\d+\s*€/.test(cleanCell);
                                        const isStock = /^\d+\s*(unités|pièces|stock)/i.test(cleanCell);

                                        return (
                                            <td key={cIdx} className="px-3 py-2 text-txt1">
                                                {isPrice ? (
                                                    <span className="inline-flex items-center rounded-md bg-pine/10 px-2 py-0.5 font-bold text-pine">
                                                        {cleanCell}
                                                    </span>
                                                ) : isStock ? (
                                                    <span className={cn(
                                                        "inline-flex items-center rounded-md px-2 py-0.5 font-medium text-[11px]",
                                                        cleanCell.startsWith("0")
                                                            ? "bg-destructive/10 text-destructive font-semibold"
                                                            : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                                    )}>
                                                        {cleanCell}
                                                    </span>
                                                ) : (
                                                    renderInlineFormatting(cleanCell)
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableHeaders = [];
            tableRows = [];
            inTable = false;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            flushList();
            const cells = trimmed.slice(1, -1).split("|");

            if (trimmed.includes("---")) {
                inTable = true;
                continue;
            }

            if (!inTable && tableHeaders.length === 0) {
                tableHeaders = cells;
            } else {
                tableRows.push(cells);
            }
            continue;
        } else if (inTable) {
            flushTable();
        }

        if (/^[-*•]\s+/.test(trimmed)) {
            listItems.push(trimmed.replace(/^[-*•]\s+/, ""));
            continue;
        } else {
            flushList();
        }

        if (!trimmed) {
            elements.push(<div key={`br-${keyIdx++}`} className="h-1.5" />);
            continue;
        }

        elements.push(
            <p key={`p-${keyIdx++}`} className="leading-relaxed text-sm text-ink my-1">
                {renderInlineFormatting(trimmed)}
            </p>
        );
    }

    flushList();
    flushTable();

    return <div className="space-y-1">{elements}</div>;
}

function renderInlineFormatting(text: string): React.ReactNode {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
            return <em key={index} className="italic text-txt2">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-pine">{part.slice(1, -1)}</code>;
        }
        return part;
    });
}

export function ChatInterface({ userDisplayName }: ChatInterfaceProps) {
    const userInitials = userDisplayName.slice(0, 2).toUpperCase();
    const getTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "welcome",
            sender: "assistant",
            text: "Bonjour ! Je suis votre conseiller Jumbo Pneus. Comment puis-je vous renseigner aujourd'hui (disponibilité d'un pneu, dimension, marque, saison, tarifs ou stock) ?",
            timestamp: getTime(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    async function handleSend(textToSend?: string) {
        const query = (textToSend ?? input).trim();
        if (!query || isLoading) return;

        setError(null);
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            sender: "user",
            text: query,
            timestamp: getTime(),
        };

        setMessages((prev) => [...prev, userMsg]);
        if (!textToSend) setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/admin/ai-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: query }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Le service d'assistance est momentanément indisponible.");
                return;
            }

            const aiMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                sender: "assistant",
                text: data.response || "Aucune donnée disponible.",
                escalatedToHuman: Boolean(data.escalated_to_human),
                timestamp: getTime(),
            };

            setMessages((prev) => [...prev, aiMsg]);
        } catch {
            setError("Connexion au réseau interrompue. Veuillez réessayer.");
        } finally {
            setIsLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function resetConversation() {
        setMessages([
            {
                id: Date.now().toString(),
                sender: "assistant",
                text: "Conversation réinitialisée. Comment puis-je vous aider sur vos pneumatiques ?",
                timestamp: getTime(),
            },
        ]);
        setError(null);
    }

    return (
        <div className="flex h-[calc(100vh-13rem)] min-h-[520px] w-full flex-col rounded-xl border border-stroke bg-card shadow-xs overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-stroke bg-white px-6 py-3.5">
                <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-pine/10 font-heading text-xs font-bold text-pine">
                        JP
                    </span>
                    <div>
                        <h2 className="font-heading text-sm font-bold text-ink">Conseiller Jumbo Pneus</h2>
                        <p className="text-[11px] text-txt2 flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Service disponible
                        </p>
                    </div>
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetConversation}
                    className="gap-2 text-xs text-txt2 hover:text-ink"
                >
                    <RotateCcw className="size-3.5" />
                    <span>Nouvelle recherche</span>
                </Button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex items-start gap-3 max-w-4xl",
                            msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                        )}
                    >
                        {/* Avatar */}
                        <div
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-2xs",
                                msg.sender === "user"
                                    ? "bg-pine text-white"
                                    : "bg-muted text-ink border border-stroke"
                            )}
                        >
                            {msg.sender === "user" ? userInitials : "JP"}
                        </div>

                        {/* Bubble */}
                        <div className="flex flex-col gap-1 max-w-[85%]">
                            <div className="flex items-center gap-2 text-[10px] text-txt2 px-1">
                                <span>{msg.sender === "user" ? userDisplayName : "Conseiller Jumbo Pneus"}</span>
                                <span>·</span>
                                <span>{msg.timestamp}</span>
                            </div>

                            <Bubble
                                variant={msg.sender === "user" ? "default" : "muted"}
                                align={msg.sender === "user" ? "end" : "start"}
                                className={cn(
                                    "max-w-full rounded-2xl shadow-2xs",
                                    msg.sender === "user"
                                        ? "bg-pine text-white border-transparent"
                                        : "bg-muted/50 border-stroke text-ink"
                                )}
                            >
                                <BubbleContent className="p-3.5">
                                    {msg.sender === "user" ? (
                                        <p className="whitespace-pre-wrap leading-relaxed text-sm">{msg.text}</p>
                                    ) : (
                                        <FormattedMessage text={msg.text} />
                                    )}
                                </BubbleContent>
                            </Bubble>

                            {/* Escalation Badge */}
                            {msg.escalatedToHuman && (
                                <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900 shadow-2xs dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
                                    <UserCheck className="size-4 text-amber-600 shrink-0" />
                                    <span>
                                        Demande transmise à un conseiller pour confirmation.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex items-start gap-3 mr-auto max-w-4xl">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-stroke bg-muted text-ink text-xs font-bold">
                            JP
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-txt2 px-1">Recherche en cours…</span>
                            <div className="flex items-center gap-2 rounded-2xl border border-stroke bg-muted/40 px-4 py-2.5 text-xs text-txt2 shadow-2xs">
                                <Spinner className="size-3.5 text-pine" />
                                <span>Recherche dans le catalogue de pneumatiques...</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="border-t border-stroke bg-white p-3.5">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex items-end gap-2.5"
                >
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Poser une question sur un pneu, une dimension ou une marque (ex: stock 205/55R16, Michelin CrossClimate 2)..."
                        className="min-h-[44px] max-h-32 resize-none rounded-xl border-stroke text-sm focus-visible:ring-pine/30"
                        rows={1}
                        disabled={isLoading}
                    />

                    <Button
                        type="submit"
                        size="icon"
                        disabled={isLoading || !input.trim()}
                        className="size-10 shrink-0 rounded-xl bg-pine hover:bg-pine/90 text-white shadow-2xs"
                    >
                        <Send className="size-4" />
                        <span className="sr-only">Envoyer</span>
                    </Button>
                </form>
            </div>
        </div>
    );
}
