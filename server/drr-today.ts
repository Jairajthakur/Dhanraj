import type { Express, Request, Response } from "express";
import * as storage from "./storage";

// ─────────────────────────────────────────────────────────────────────────────
// Today's DRR — agent picks which customers' payments are expected TODAY.
//
// Table: drr_today_payments (one row per agent / case / day)
// Routes (all agent-authenticated, scoped to the logged-in agent):
//   GET    /api/drr/today-payments              → today's selected customers + totals
//   GET    /api/drr/today-candidates            → all the agent's unpaid cases (+ selected flag)
//   PUT    /api/drr/today-payments              → replace today's selection { items: [...] }
//   DELETE /api/drr/today-payments/:source/:id  → remove one customer from today's list
// ─────────────────────────────────────────────────────────────────────────────

// "Today" in India time, so the list rolls over at midnight IST (the server runs in UTC).
const TODAY = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;

// Safe numeric cast (same approach used elsewhere in routes.ts for pos).
const num = (col: string) =>
  `NULLIF(REGEXP_REPLACE(COALESCE(${col}::text, ''), '[^0-9.]', '', 'g'), '')::numeric`;

// Default expected amount for a case: EMI due, else EMI amount, else 0.
const defaultAmt = (alias: string) =>
  `COALESCE(NULLIF(${num(alias + ".emi_due")}, 0), NULLIF(${num(alias + ".emi_amount")}, 0), 0)`;

const TABLES: Record<string, string> = { loan: "loan_cases", bkt: "bkt_cases" };

export async function initDrrTodayTable() {
  await storage.query(`
    CREATE TABLE IF NOT EXISTS drr_today_payments (
      id              SERIAL PRIMARY KEY,
      agent_id        INTEGER NOT NULL REFERENCES fos_agents(id) ON DELETE CASCADE,
      source          VARCHAR(10) NOT NULL DEFAULT 'loan',
      case_id         INTEGER NOT NULL,
      selection_date  DATE NOT NULL,
      expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE (agent_id, source, case_id, selection_date)
    )
  `);
  await storage.query(
    `CREATE INDEX IF NOT EXISTS idx_drr_today_agent_date ON drr_today_payments (agent_id, selection_date)`
  );
}

async function getTodaySelections(agentId: number) {
  const result = await storage.query(
    `
    SELECT 'loan' AS source, c.id, c.customer_name, c.loan_no, c.bkt, c.status,
           c.mobile_no, c.company_name, c.ptp_date, s.expected_amount
    FROM drr_today_payments s
    JOIN loan_cases c ON s.source = 'loan' AND c.id = s.case_id AND c.agent_id = s.agent_id
    WHERE s.agent_id = $1 AND s.selection_date = ${TODAY}
    UNION ALL
    SELECT 'bkt' AS source, c.id, c.customer_name, c.loan_no, c.bkt, c.status,
           c.mobile_no, c.company_name, c.ptp_date, s.expected_amount
    FROM drr_today_payments s
    JOIN bkt_cases c ON s.source = 'bkt' AND c.id = s.case_id AND c.agent_id = s.agent_id
    WHERE s.agent_id = $1 AND s.selection_date = ${TODAY}
    ORDER BY customer_name
    `,
    [agentId]
  );

  const items = result.rows.map((r: any) => ({
    ...r,
    expected_amount: parseFloat(r.expected_amount) || 0,
    received: r.status === "Paid",
  }));

  const expected = items.reduce((a: number, r: any) => a + r.expected_amount, 0);
  const received = items.filter((r: any) => r.received).reduce((a: number, r: any) => a + r.expected_amount, 0);

  return {
    items,
    totals: {
      count: items.length,
      received_count: items.filter((r: any) => r.received).length,
      expected,
      received,
      pending: Math.max(0, expected - received),
    },
  };
}

export function registerDrrTodayRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: any) => any
) {
  // ── GET today's selected customers ─────────────────────────────────────────
  app.get("/api/drr/today-payments", requireAuth, async (req, res) => {
    try {
      res.json(await getTodaySelections(req.session.agentId!));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── GET every unpaid case the agent can pick from ──────────────────────────
  app.get("/api/drr/today-candidates", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const sel = (src: string, alias: string) =>
        `LEFT JOIN drr_today_payments s
           ON s.agent_id = ${alias}.agent_id AND s.source = '${src}'
          AND s.case_id = ${alias}.id AND s.selection_date = ${TODAY}`;

      const result = await storage.query(
        `
        SELECT 'loan' AS source, c.id, c.customer_name, c.loan_no, c.bkt, c.status,
               c.mobile_no, c.company_name, c.ptp_date,
               ${defaultAmt("c")} AS default_amount,
               s.expected_amount, (s.id IS NOT NULL) AS selected,
               (c.ptp_date = ${TODAY}) AS ptp_today
        FROM loan_cases c
        ${sel("loan", "c")}
        WHERE c.agent_id = $1 AND (c.status IS DISTINCT FROM 'Paid' OR s.id IS NOT NULL)
        UNION ALL
        SELECT 'bkt' AS source, c.id, c.customer_name, c.loan_no, c.bkt, c.status,
               c.mobile_no, c.company_name, c.ptp_date,
               ${defaultAmt("c")} AS default_amount,
               s.expected_amount, (s.id IS NOT NULL) AS selected,
               (c.ptp_date = ${TODAY}) AS ptp_today
        FROM bkt_cases c
        ${sel("bkt", "c")}
        WHERE c.agent_id = $1 AND (c.status IS DISTINCT FROM 'Paid' OR s.id IS NOT NULL)
        ORDER BY customer_name
        `,
        [agentId]
      );

      const cases = result.rows.map((r: any) => ({
        ...r,
        default_amount: parseFloat(r.default_amount) || 0,
        expected_amount: r.expected_amount != null ? parseFloat(r.expected_amount) : null,
        ptp_today: r.ptp_today === true,
        selected: r.selected === true,
      }));
      res.json({ cases });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── PUT replace today's selection ──────────────────────────────────────────
  // body: { items: [{ source: "loan"|"bkt", id: number, expected_amount?: number }] }
  app.put("/api/drr/today-payments", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const raw = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!raw) return res.status(400).json({ message: "items array is required" });
      if (raw.length > 500) return res.status(400).json({ message: "Too many customers selected (max 500)" });

      // De-dupe and sanitise
      const wanted = new Map<string, { source: string; id: number; amount: number | null }>();
      for (const it of raw) {
        const source = String(it?.source || "");
        const id = Number(it?.id);
        if (!TABLES[source] || !Number.isInteger(id) || id <= 0) continue;
        const amt = it?.expected_amount;
        const amount = amt === null || amt === undefined || amt === "" ? null : Number(amt);
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
          return res.status(400).json({ message: "Invalid expected amount" });
        }
        wanted.set(`${source}:${id}`, { source, id, amount });
      }

      // Keep only cases that really belong to this agent (and pick up default amounts)
      const valid: { source: string; id: number; amount: number }[] = [];
      for (const source of Object.keys(TABLES)) {
        const ids = [...wanted.values()].filter((w) => w.source === source).map((w) => w.id);
        if (!ids.length) continue;
        const owned = await storage.query(
          `SELECT c.id, ${defaultAmt("c")} AS default_amount
           FROM ${TABLES[source]} c
           WHERE c.agent_id = $1 AND c.id = ANY($2::int[])`,
          [agentId, ids]
        );
        for (const row of owned.rows) {
          const w = wanted.get(`${source}:${row.id}`)!;
          valid.push({
            source,
            id: row.id,
            amount: w.amount !== null ? w.amount : parseFloat(row.default_amount) || 0,
          });
        }
      }

      // Remove anything for today that is no longer selected
      const keys = valid.map((v) => `${v.source}:${v.id}`);
      await storage.query(
        `DELETE FROM drr_today_payments
         WHERE agent_id = $1 AND selection_date = ${TODAY}
           AND NOT ((source || ':' || case_id::text) = ANY($2::text[]))`,
        [agentId, keys]
      );

      // Upsert the selected ones
      if (valid.length) {
        await storage.query(
          `INSERT INTO drr_today_payments (agent_id, source, case_id, selection_date, expected_amount)
           SELECT $1, t.source, t.case_id, ${TODAY}, t.amount
           FROM unnest($2::text[], $3::int[], $4::numeric[]) AS t(source, case_id, amount)
           ON CONFLICT (agent_id, source, case_id, selection_date)
           DO UPDATE SET expected_amount = EXCLUDED.expected_amount, updated_at = NOW()`,
          [agentId, valid.map((v) => v.source), valid.map((v) => v.id), valid.map((v) => v.amount)]
        );
      }

      res.json({ success: true, ...(await getTodaySelections(agentId)) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── DELETE one customer from today's list ──────────────────────────────────
  app.delete("/api/drr/today-payments/:source/:id", requireAuth, async (req, res) => {
    try {
      const source = String(req.params.source);
      const id = Number(req.params.id);
      if (!TABLES[source] || !Number.isInteger(id)) return res.status(400).json({ message: "Invalid case" });
      await storage.query(
        `DELETE FROM drr_today_payments
         WHERE agent_id = $1 AND source = $2 AND case_id = $3 AND selection_date = ${TODAY}`,
        [req.session.agentId!, source, id]
      );
      res.json({ success: true, ...(await getTodaySelections(req.session.agentId!)) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
