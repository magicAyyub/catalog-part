/**
 * Braking catalog coverage report.
 *
 * Produces the figures showing that serving the catalog locally beats the billed
 * call: what was acquired, what it cost, what it saves, and how fast it answers.
 *
 * Usage: pnpm catalog:report
 */

import { existsSync } from "fs";
import { db } from "../lib/db/client";
import { sql } from "drizzle-orm";

if (existsSync(".env")) {
    try {
        process.loadEnvFile(".env");
    } catch {
        // Variables déjà dans l'environnement.
    }
}

/** RapidAPI latency baselines measured on 2026-08-06 against this catalog. */
const RAPIDAPI_BASELINE = {
    articleListMs: 6654,
    articleDetailsMs: 1240,
    callsPerVehicle: 10,
};

function one<T = number>(rows: Record<string, unknown>[], key = "v"): T {
    return (rows[0]?.[key] ?? 0) as T;
}

async function q(text: string): Promise<Record<string, unknown>[]> {
    const res = await db.all(sql.raw(text));
    return res as Record<string, unknown>[];
}

const LABEL_WIDTH = 48;

function bar(label: string, value: string) {
    // Un libellé plus long que la colonne ne doit pas coller la valeur.
    const pad = label.length >= LABEL_WIDTH ? `\n  ${" ".repeat(LABEL_WIDTH)}` : " ".repeat(LABEL_WIDTH - label.length);
    console.info(`  ${label}${pad}${value}`);
}

function section(title: string) {
    console.info(`\n\x1b[1m${title}\x1b[0m`);
}

async function main() {
    console.info("\nRapport de couverture, catalogue freinage\n");

    // Acquisition
    section("Ce qui a été acquis");

    const jobs = await q(`
        select status, count(*) as n, sum(api_calls) as calls, sum(duration_ms) as ms
        from index_job group by status`);
    const totalCalls = jobs.reduce((s, j) => s + Number(j.calls ?? 0), 0);
    const okCouples = Number(jobs.find((j) => j.status === "ok")?.n ?? 0);

    for (const j of jobs) {
        bar(
            `couples « ${j.status} »`,
            `${j.n}  (${j.calls} appels, ${Math.round(Number(j.ms ?? 0) / 1000)} s)`
        );
    }

    const vehicles = one(await q(`select count(*) as v from td_vehicle`));
    const articles = one(await q(`select count(*) as v from td_article`));
    const fitments = one(await q(`select count(*) as v from td_fitment`));
    const criteria = one(await q(`select count(*) as v from td_criteria`));
    const wva = one(await q(`select count(*) as v from td_wva`));
    const oem = one(await q(`select count(*) as v from td_oem`));

    bar("véhicules", String(vehicles));
    bar("références distinctes", String(articles));
    bar("liens référence ↔ véhicule", String(fitments));
    bar("lignes de caractéristiques", String(criteria));
    bar("numéros WVA", String(wva));
    bar("références OEM", oem ? String(oem) : "0  (passe 2 non lancée)");

    // Amortissement
    section("Amortissement, effet du stockage unique");

    const shared = await q(`
        select vehicles_per_article, count(*) as n from (
            select article_id, count(distinct vehicle_id) as vehicles_per_article
            from td_fitment group by article_id
        ) group by vehicles_per_article order by vehicles_per_article desc limit 5`);

    const reused = one(
        await q(`select count(*) as v from (
            select article_id from td_fitment group by article_id having count(distinct vehicle_id) > 1)`)
    );

    bar(
        "références partagées entre plusieurs véhicules",
        `${reused} / ${articles}` + (articles ? ` (${Math.round((100 * reused) / Number(articles))} %)` : "")
    );
    for (const r of shared) {
        bar(`  · présentes sur ${r.vehicles_per_article} véhicule(s)`, `${r.n} références`);
    }

    // Le modèle précédent dupliquait une référence par véhicule : le nombre de
    // lignes qu'il aurait fallu écrire est exactement le nombre de liens.
    const savedRows = Number(fitments) - Number(articles);
    bar(
        "lignes d'articles évitées vs modèle par véhicule",
        savedRows > 0 ? `${savedRows}` : "0 (catalogue encore trop petit)"
    );
    // Mesure exacte, pas extrapolation : dans un modèle par véhicule, chaque
    // lien porterait une copie des caractéristiques de sa référence.
    const perVehicleRows = one(await q(`
        select coalesce(sum(n),0) as v from (
            select (select count(*) from td_criteria c where c.article_id = f.article_id) as n
            from td_fitment f)`));
    bar(
        "caractéristiques stockées une fois",
        `${criteria}  au lieu de ${perVehicleRows} (× ${(Number(perVehicleRows) / Math.max(Number(criteria), 1)).toFixed(1)} de moins)`
    );

    // Complétude
    section("Complétude, niveau de détail atteint");

    const distinctCriteria = one(await q(`select count(distinct criteria_name) as v from td_criteria`));
    const avgCriteria = one<number>(
        await q(`select round(cast(count(*) as real) / max(count(distinct article_id),1), 1) as v from td_criteria`)
    );
    const noCriteria = one(
        await q(`select count(*) as v from td_article a
                 where not exists (select 1 from td_criteria c where c.article_id = a.article_id)`)
    );

    bar("noms de critères distincts", `${distinctCriteria} / 40 du vocabulaire TecDoc observé`);
    bar("critères par référence, en moyenne", String(avgCriteria));
    bar(
        "références sans aucune caractéristique",
        `${noCriteria} / ${articles}` +
            (Number(articles) ? ` (${Math.round((100 * Number(noCriteria)) / Number(articles))} %)` : "")
    );
    bar("pour mémoire, portail Préférence scrapé", "11 champs physiques seulement");

    const byBrand = await q(`
        select s.supplier_name as brand, count(distinct a.article_id) as arts,
               count(c.article_id) as crit
        from td_article a
        join td_supplier s on s.supplier_id = a.supplier_id
        left join td_criteria c on c.article_id = a.article_id
        group by s.supplier_name order by arts desc`);
    console.info("");
    for (const b of byBrand) {
        bar(`  ${b.brand}`, `${b.arts} réfs · ${b.crit} critères`);
    }

    // Jointure avec les prix
    section("Prêt pour les prix, la clé de jointure");

    const offers = one(await q(`select count(*) as v from supplier_offer`));
    const dupKeys = one(
        await q(`select count(*) as v from (
            select brand_key, article_no_key from td_article
            group by brand_key, article_no_key having count(*) > 1)`)
    );
    bar("clés (marque, référence) en collision", `${dupKeys}  (0 attendu)`);

    if (Number(offers) === 0) {
        bar("offres grossistes enregistrées", "0 , scraping des prix à brancher");
    } else {
        const matched = one(await q(`
            select count(*) as v from td_article a
            join supplier_offer o
              on o.brand_key = a.brand_key and o.article_no_key = a.article_no_key`));
        bar(
            "références rapprochées d'une offre",
            `${matched} / ${articles} (${Math.round((100 * Number(matched)) / Math.max(Number(articles), 1))} %)`
        );
    }

    // Latence et coût
    section("Latence et coût du service");

    const sampleVehicle = one(
        await q(`select vehicle_id as v from td_fitment group by vehicle_id
                 order by count(*) desc limit 1`)
    );

    const readQuery = `
        select a.article_id, a.article_no, s.supplier_name, a.image_url
        from td_fitment f
        join td_article a on a.article_id = f.article_id
        join td_supplier s on s.supplier_id = a.supplier_id
        where f.vehicle_id = ${sampleVehicle} and f.category_id = 100030`;

    // Une seule mesure serait dominée par le bruit ; on prend la médiane.
    const timings: number[] = [];
    for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        await q(readQuery);
        timings.push(performance.now() - t0);
    }
    timings.sort((a, b) => a - b);
    const p50 = timings[Math.floor(timings.length / 2)];
    const p95 = timings[Math.floor(timings.length * 0.95)];

    const criteriaQuery = `
        select c.article_id, c.criteria_name, c.criteria_value
        from td_criteria c
        join td_fitment f on f.article_id = c.article_id
        where f.vehicle_id = ${sampleVehicle} and f.category_id = 100030`;
    const t1 = performance.now();
    const critRows = await q(criteriaQuery);
    const critMs = performance.now() - t1;

    bar(`liste d'articles (véhicule ${sampleVehicle})`, `p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms`);
    bar("caractéristiques du même véhicule", `${critRows.length} lignes en ${critMs.toFixed(2)} ms`);
    bar(
        "même donnée via RapidAPI",
        `${(RAPIDAPI_BASELINE.articleListMs / 1000).toFixed(1)} s · ${RAPIDAPI_BASELINE.callsPerVehicle} appels facturés`
    );
    const speedup = RAPIDAPI_BASELINE.articleListMs / Math.max(p50, 0.01);
    bar("accélération", `× ${Math.round(speedup).toLocaleString("fr-FR")}`);

    section("Bilan");
    bar("coût d'acquisition consommé", `${totalCalls} appels facturés`);
    bar("coût par recherche en régime établi", "0 appel");
    bar(
        "amortissement",
        okCouples > 0
            ? `${(totalCalls / okCouples).toFixed(1)} appels par couple indexé, payés une fois`
            : "n/a"
    );
    console.info("");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});