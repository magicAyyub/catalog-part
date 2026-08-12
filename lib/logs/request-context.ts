/**
 * Correlation id shared by every log line of one request.
 *
 * The trace page could not reconstruct a plate search because nothing tied the
 * lines together: `rapidapi_call` carries only a path, never the plate that
 * caused it. An AsyncLocalStorage store solves that without touching the
 * hundred call sites, since the logger reads it on its own.
 *
 * Server only, and Node runtime only. Routes pinned to the edge runtime would
 * simply log without a correlation id rather than fail.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
    requestId: string;
    /** Route name, so a group can be labelled before its first line lands. */
    route: string;
    startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
    return storage.getStore();
}

/** Runs `fn` with a fresh correlation id that every logger call inside picks up. */
export function withRequestContext<T>(route: string, fn: () => Promise<T>): Promise<T> {
    return storage.run({ requestId: randomUUID().slice(0, 8), route, startedAt: Date.now() }, fn);
}
