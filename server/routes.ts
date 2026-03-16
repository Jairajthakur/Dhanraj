import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import ExcelJS from "exceljs";
import * as storage from "./storage";
import path from "node:path";
import fs from "node:fs";
import express from "express";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function worksheetToRows(worksheet: ExcelJS.Worksheet, rawStrings: boolean): any[][] {
  const rawRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowVals = row.values as any[];
    const maxCol = rowVals.length - 1;
    const vals: any[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const v = rowVals[c];
      if (v === null || v === undefined) {
        vals.push("");
      } else if (typeof v === "object") {
        if (Array.isArray(v.richText)) {
          vals.push(v.richText.map((r: any) => r.text).join(""));
        } else if (v.result !== undefined) {
          vals.push(rawStrings ? String(v.result) : v.result);
        } else if (v.text !== undefined) {
          vals.push(String(v.text));
        } else if (v instanceof Date) {
          vals.push(rawStrings ? v.toISOString().slice(0, 10) : v);
        } else {
          vals.push(rawStrings ? String(v) : v);
        }
      } else {
        vals.push(rawStrings ? String(v) : v);
      }
    }
    rawRows.push(vals);
  });
  return rawRows;
}

const screenshotDir = path.join(process.cwd(), "server/uploads/screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });
const screenshotUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, screenshotDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
    return { ok: false, error: "invalid_token" };
  }
  try {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: "default",
        data,
      }),
    });
    const json: any = await resp.json().catch(() => ({}));
    const ticket = json?.data;
    if (ticket?.status === "error") {
      console.error("[push] Expo rejected push:", ticket.details?.error, pushToken.slice(0, 30));
      return { ok: false, status: "error", error: ticket.details?.error };
    }
    return { ok: true, status: ticket?.status ?? "ok" };
  } catch (e: any) {
    console.error("[push] sendExpoPush exception:", e.message);
    return { ok: false, error: e.message };
  }
}

function normalizeHeader(h: string): string {
  return h.toString().toLowerCase().replace(/[\s_\-\.\/\\+]/g, "");
}

function parseNum(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  if (isNaN(n)) return null;
  return s;
}

function normalizeStatus(val: any): string {
  const s = String(val || "").trim().toUpperCase();
  if (s === "TRUE" || s === "PAID" || s === "YES" || s === "1") return "Paid";
  if (s === "FALSE" || s === "UNPAID" || s === "NO" || s === "0") return "Unpaid";
  if (s === "PTP") return "PTP";
  if (s === "PAID") return "Paid";
  const raw = String(val || "").trim();
  if (raw === "Paid" || raw === "Unpaid" || raw === "PTP") return raw;
  if (raw === "Follow Up" || raw === "FOLLOW UP" || raw === "FOLLOWUP") return "Unpaid";
  return "Unpaid";
}

function parseDate(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (!s) return null;
  const ddmmyyyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,"0")}-${ddmmyyyy[1].padStart(2,"0")}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return s;
}

const HEADER_SENTINEL = new Set([
  "loan no", "loanno", "loan number", "customer name", "customername",
  "fos name", "fosname", "fos_name", "rollback", "emi", "pos",
]);

function isRepeatHeaderRow(mapped: Record<string, any>): boolean {
  const loanNo = String(mapped.loan_no || "").toLowerCase().trim();
  return HEADER_SENTINEL.has(loanNo) || loanNo === "loan no" || loanNo === "s.no" || /^s\.?\s*no\.?$/i.test(loanNo);
}

const COLUMN_MAP: Record<string, string> = {
  loanno: "loan_no", loannumber: "loan_no",
  appid: "app_id", applicationid: "app_id", appno: "app_id",
  customername: "customer_name", applicantname: "customer_name", name: "customer_name",
  emi: "emi_amount", emiamount: "emi_amount",
  emidue: "emi_due",
  cbc: "cbc",
  lpp: "lpp",
  cbclpp: "cbc_lpp", cbclppamount: "cbc_lpp",
  pos: "pos", principaloutstanding: "pos", outstanding: "pos",
  bkt: "bkt", bucket: "bkt",
  rollback: "rollback",
  clearance: "clearance",
  address: "address", customeraddress: "address", custaddress: "address",
  customeradddress: "address", customeradress: "address", customeaddress: "address",
  firstemidueda: "first_emi_due_date", firstemiduedate: "first_emi_due_date", firstemidate: "first_emi_due_date",
  loanmaturitydate: "loan_maturity_date", maturitydate: "loan_maturity_date",
  assetmake: "asset_make", make: "asset_make",
  registrationno: "registration_no", regno: "registration_no", regNo: "registration_no",
  engineno: "engine_no", enginenumber: "engine_no",
  chassisno: "chassis_no", chassisnumber: "chassis_no",
  referenceaddress: "reference_address", refaddress: "reference_address",
  ten: "tenor", tenor: "tenor", tenure: "tenor",
  number: "mobile_no",
  pro: "pro", product: "pro",
  fosname: "fos_name", fos: "fos_name", fosagent: "fos_name", agent: "fos_name",
  mobileno: "mobile_no", mobile: "mobile_no", phone: "mobile_no", contactno: "mobile_no",
  status: "status",
  detailfb: "latest_feedback", fb: "latest_feedback", feedback: "latest_feedback",
  comments: "feedback_comments",
  ptpdate: "telecaller_ptp_date", ptp: "telecaller_ptp_date", ptpdt: "telecaller_ptp_date", promisetopaydatdate: "telecaller_ptp_date", promisetopaydate: "telecaller_ptp_date",
};

declare module "express-session" {
  interface SessionData {
    agentId?: number;
    role?: string;
  }
}

const BKT_PERF_SQL = `
  SELECT
    fa.id, fa.name,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt1')::int AS bkt1_count,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status = 'Paid')::int AS bkt1_paid_count,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1'), 0)                              AS bkt1_pos_total,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status = 'Paid'), 0)      AS bkt1_pos_paid,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status <> 'Paid'), 0)     AS bkt1_pos_unpaid,
    COALESCE(SUM(CASE WHEN bc.rollback::text ~ '^[0-9,]+\.?[0-9]*$' THEN replace(bc.rollback::text,',','')::numeric ELSE NULL END) FILTER (WHERE bc.case_category = 'bkt1'), 0) AS bkt1_rollback,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt2')::int AS bkt2_count,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt2' AND bc.status = 'Paid')::int AS bkt2_paid_count,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt2'), 0)                              AS bkt2_pos_total,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt2' AND bc.status = 'Paid'), 0)      AS bkt2_pos_paid,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt2' AND bc.status <> 'Paid'), 0)     AS bkt2_pos_unpaid,
    COALESCE(SUM(CASE WHEN bc.rollback::text ~ '^[0-9,]+\.?[0-9]*$' THEN replace(bc.rollback::text,',','')::numeric ELSE NULL END) FILTER (WHERE bc.case_category = 'bkt2'), 0) AS bkt2_rollback,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt3')::int AS bkt3_count,
    COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt3' AND bc.status = 'Paid')::int AS bkt3_paid_count,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt3'), 0)                              AS bkt3_pos_total,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt3' AND bc.status = 'Paid'), 0)      AS bkt3_pos_paid,
    COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt3' AND bc.status <> 'Paid'), 0)     AS bkt3_pos_unpaid,
    COALESCE(SUM(CASE WHEN bc.rollback::text ~ '^[0-9,]+\.?[0-9]*$' THEN replace(bc.rollback::text,',','')::numeric ELSE NULL END) FILTER (WHERE bc.case_category = 'bkt3'), 0) AS bkt3_rollback,
    COUNT(bc.id) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0)::int AS penal_count,
    COUNT(bc.id) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0 AND bc.status = 'Paid')::int AS penal_paid_count,
    COALESCE(SUM(bc.cbc::numeric) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0), 0)                             AS penal_cbc_total,
    COALESCE(SUM(bc.cbc::numeric) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0 AND bc.status = 'Paid'), 0)      AS penal_cbc_paid,
    COALESCE(SUM(bc.cbc::numeric) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0 AND bc.status <> 'Paid'), 0)     AS penal_cbc_unpaid,
    COALESCE(SUM(CASE WHEN bc.rollback::text ~ '^[0-9,]+\.?[0-9]*$' THEN replace(bc.rollback::text,',','')::numeric ELSE NULL END) FILTER (WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0), 0) AS penal_rollback
  FROM fos_agents fa
  LEFT JOIN bkt_cases bc ON bc.agent_id = fa.id
  WHERE fa.role = 'fos'
  GROUP BY fa.id, fa.name
  HAVING COUNT(bc.id) > 0
  ORDER BY fa.name
`;

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  await storage.initBktPerfSummaryTable();
  // ... rest of code
  app.use(
    "/uploads/screenshots",
    express.static(path.join(process.cwd(), "server/uploads/screenshots"))
  );

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "fos-secret-key-2024",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  function requireAuth(req: Request, res: Response, next: any) {
    if (!req.session.agentId) return res.status(401).json({ message: "Unauthorized" });
    next();
  }

  function requireAdmin(req: Request, res: Response, next: any) {
    if (!req.session.agentId || req.session.role !== "admin")
      return res.status(403).json({ message: "Forbidden" });
    next();
  }

  function requireRepo(req: Request, res: Response, next: any) {
    if (!req.session.agentId || req.session.role !== "repo")
      return res.status(403).json({ message: "Forbidden" });
    next();
  }

  // Repo — read-only view of all allocation cases
  app.get("/api/repo/cases", requireRepo, async (req, res) => {
    try {
      const cases = await storage.getAllLoanCases();
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Auth
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const agent = await storage.getAgentByUsername(username);
      if (!agent || agent.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.agentId = agent.id;
      req.session.role = agent.role;
      const { password: _, ...safeAgent } = agent;
      res.json({ agent: safeAgent });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getAgentById(req.session.agentId!);
      if (!agent) return res.status(404).json({ message: "Not found" });
      const { password: _, ...safeAgent } = agent;
      res.json({ agent: safeAgent });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // FOS: Cases
  app.get("/api/cases", requireAuth, async (req, res) => {
    try {
      const cases = await storage.getLoanCasesByAgent(req.session.agentId!);
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
    try {
      const c = await storage.getLoanCaseById(Number(req.params.id));
      if (!c) return res.status(404).json({ message: "Not found" });
      res.json({ case: c });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/cases/:id/feedback", requireAuth, async (req, res) => {
    try {
      const { status, feedback, comments, ptp_date, rollback_yn } = req.body;
      const ynVal = rollback_yn === true || rollback_yn === "true" ? true : rollback_yn === false || rollback_yn === "false" ? false : null;
      const caseId = Number(req.params.id);

      const oldRow = await storage.query(
        `SELECT status, rollback_yn, pos::numeric AS pos, agent_id, bkt, pro FROM loan_cases WHERE id = $1`,
        [caseId]
      );
      const old = oldRow.rows[0];

      await storage.updateLoanCaseFeedback(caseId, status, feedback, comments, ptp_date, ynVal);

      if (old && old.bkt && old.agent_id && (old.pro || "").toUpperCase() !== "UC") {
        const pos = parseFloat(old.pos) || 0;
        const bktKey = `bkt${old.bkt}`;
        const wasPaid    = old.status === "Paid";
        const nowPaid    = status === "Paid";
        const wasRb      = old.rollback_yn === true;
        const nowRb      = ynVal === true;
        const dPos       = !wasPaid && nowPaid ? pos : wasPaid && !nowPaid ? -pos : 0;
        const dCount     = !wasPaid && nowPaid ? 1  : wasPaid && !nowPaid ? -1  : 0;
        const dRb        = !wasRb  && nowRb   ? pos : wasRb  && !nowRb   ? -pos : 0;
        await storage.applyBktPerfDelta(old.agent_id, bktKey, dPos, -dPos, dCount, -dCount, dRb, -dRb);
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Stats
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getAgentStats(req.session.agentId!);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/today-ptp", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const result = await storage.query(`
        SELECT 'loan' AS source, id, customer_name, loan_no, pos::numeric AS pos,
               ptp_date, telecaller_ptp_date,
               (status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE)) AS fos_ptp,
               (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE) AS tele_ptp
        FROM loan_cases
        WHERE agent_id = $1
          AND (
            (status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE))
            OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE)
          )
        UNION ALL
        SELECT 'bkt' AS source, id, customer_name, loan_no, pos::numeric AS pos,
               ptp_date, telecaller_ptp_date,
               (status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE)) AS fos_ptp,
               (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE) AS tele_ptp
        FROM bkt_cases
        WHERE agent_id = $1
          AND (
            (status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE))
            OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE)
          )
        ORDER BY customer_name
      `, [agentId]);
      res.json({ count: result.rows.length, cases: result.rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Attendance
  app.get("/api/attendance/today", requireAuth, async (req, res) => {
    try {
      const att = await storage.getTodayAttendance(req.session.agentId!);
      res.json({ attendance: att });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/attendance/checkin", requireAuth, async (req, res) => {
    try {
      await storage.checkIn(req.session.agentId!);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/attendance/checkout", requireAuth, async (req, res) => {
    try {
      await storage.checkOut(req.session.agentId!);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Salary
  app.get("/api/salary", requireAuth, async (req, res) => {
    try {
      const salary = await storage.getSalaryDetails(req.session.agentId!);
      res.json({ salary });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Depositions
  app.get("/api/depositions", requireAuth, async (req, res) => {
    try {
      const deps = await storage.getDepositions(req.session.agentId!);
      res.json({ depositions: deps });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/depositions", requireAuth, async (req, res) => {
    try {
      await storage.createDeposition({ agentId: req.session.agentId!, ...req.body });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Change Password
  app.put("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const agent = await storage.getAgentById(req.session.agentId!);
      if (!agent || agent.password !== currentPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      await storage.updateAgentPassword(req.session.agentId!, newPassword);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin Routes
  app.get("/api/admin/agents", requireAdmin, async (req, res) => {
    try {
      const agents = await storage.getAllAgents();
      res.json({ agents });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAllAgentStats();
      res.json({ stats });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/cases", requireAdmin, async (req, res) => {
    try {
      const cases = await storage.getAllLoanCases();
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/cases/agent/:agentId", requireAdmin, async (req, res) => {
    try {
      const cases = await storage.getLoanCasesByAgent(Number(req.params.agentId));
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/salary", requireAdmin, async (req, res) => {
    try {
      const salary = await storage.getAllSalaryDetails();
      res.json({ salary });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/salary", requireAdmin, async (req, res) => {
    try {
      await storage.createSalary(req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/depositions", requireAdmin, async (req, res) => {
    try {
      const deps = await storage.getAllDepositions();
      res.json({ depositions: deps });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Required Deposits
  app.get("/api/admin/required-deposits", requireAdmin, async (req, res) => {
    try {
      const deposits = await storage.getAllRequiredDeposits();
      res.json({ deposits });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/required-deposits", requireAdmin, async (req, res) => {
    try {
      const { agentId, amount, description, dueDate } = req.body;
      if (!agentId || !amount) return res.status(400).json({ message: "agentId and amount are required" });
      const deposit = await storage.createRequiredDeposit({ agentId: Number(agentId), amount: Number(amount), description, dueDate });
      const agentRow = await storage.query("SELECT push_token FROM fos_agents WHERE id = $1", [Number(agentId)]);
      const pushToken = agentRow.rows[0]?.push_token;
      if (pushToken) {
        const amtStr = Number(amount).toLocaleString("en-IN");
        await sendExpoPush(pushToken, "Deposit Required", `Admin has assigned you a deposit of ₹${amtStr}. Please deposit within 2 hours.`);
      }
      res.json({ deposit });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/admin/required-deposits/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteRequiredDeposit(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/required-deposits", requireAuth, async (req, res) => {
    try {
      const deposits = await storage.getRequiredDeposits(req.session.agentId!);
      res.json({ deposits });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/push-token", requireAuth, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "token required" });
      await storage.query("UPDATE fos_agents SET push_token = $1 WHERE id = $2", [token, req.session.agentId!]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/push-status", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`
        SELECT id, name,
          CASE WHEN push_token IS NOT NULL AND push_token <> '' THEN true ELSE false END AS has_token,
          LEFT(push_token, 40) AS token_preview
        FROM fos_agents WHERE role = 'fos' ORDER BY name
      `);
      res.json({ agents: result.rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test-push/:agentId", requireAdmin, async (req, res) => {
    try {
      const agentRow = await storage.query(
        "SELECT id, name, push_token FROM fos_agents WHERE id = $1",
        [Number(req.params.agentId)]
      );
      const agent = agentRow.rows[0];
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (!agent.push_token) return res.status(400).json({ message: "Agent has no push token registered. They must log in via the APK first." });
      const result = await sendExpoPush(
        agent.push_token,
        "🔔 Test Notification",
        `Hello ${agent.name}! This is a test notification from the admin panel.`,
        { type: "test" }
      );
      res.json({ success: result.ok, ...result, agentName: agent.name });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/test-push-all", requireAdmin, async (req, res) => {
    try {
      const agents = await storage.query(
        "SELECT id, name, push_token FROM fos_agents WHERE role = 'fos' AND push_token IS NOT NULL AND push_token <> ''"
      );
      if (agents.rows.length === 0) return res.json({ sent: 0, message: "No agents have push tokens registered yet." });
      const results: any[] = [];
      for (const agent of agents.rows) {
        const r = await sendExpoPush(
          agent.push_token,
          "🔔 Test Notification",
          `Hello ${agent.name}! Admin sent a test notification.`,
          { type: "test" }
        );
        results.push({ agentId: agent.id, name: agent.name, ...r });
      }
      res.json({ sent: results.filter(r => r.ok).length, total: results.length, results });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/profile-photo", requireAuth, async (req, res) => {
    try {
      const { photoUrl } = req.body;
      await storage.query("UPDATE fos_agents SET photo_url = $1 WHERE id = $2", [photoUrl, req.session.agentId!]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const result = await storage.query("SELECT id, name, username, role, phone, photo_url FROM fos_agents WHERE id = $1", [req.session.agentId!]);
      res.json(result.rows[0] || {});
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/required-deposits/:id/screenshot", requireAuth, screenshotUpload.single("screenshot"), async (req, res) => {
    try {
      const depositId = Number(req.params.id);
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : (process.env.APP_URL || "");
      const screenshotUrl = `${baseUrl}/uploads/screenshots/${req.file.filename}`;
      await storage.query(
        "UPDATE required_deposits SET screenshot_url = $1, screenshot_uploaded_at = NOW() WHERE id = $2 AND agent_id = $3",
        [screenshotUrl, depositId, req.session.agentId!]
      );
      const adminRow = await storage.query(
        "SELECT push_token FROM fos_agents WHERE role = 'admin' AND push_token IS NOT NULL LIMIT 1"
      );
      const adminToken = adminRow.rows[0]?.push_token;
      if (adminToken) {
        const agentRow = await storage.query("SELECT name FROM fos_agents WHERE id = $1", [req.session.agentId!]);
        const agentName = agentRow.rows[0]?.name || "A FOS agent";
        await sendExpoPush(adminToken, "📸 Screenshot Uploaded", `${agentName} has uploaded a payment screenshot. Please verify.`);
      }
      res.json({ success: true, screenshotUrl });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/admin/required-deposits/:id/verify", requireAdmin, async (req, res) => {
    try {
      await storage.query("UPDATE required_deposits SET alarm_scheduled = TRUE WHERE id = $1", [Number(req.params.id)]);
      const depositRow = await storage.query(
        `SELECT rd.agent_id, rd.amount, fa.push_token, fa.name
         FROM required_deposits rd
         JOIN fos_agents fa ON fa.id = rd.agent_id
         WHERE rd.id = $1`,
        [Number(req.params.id)]
      );
      const deposit = depositRow.rows[0];
      if (deposit?.push_token) {
        const amtStr = parseFloat(deposit.amount).toLocaleString("en-IN");
        await sendExpoPush(
          deposit.push_token,
          "✅ Deposit Verified",
          `Your payment screenshot of ₹${amtStr} has been verified by admin.`
        );
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/attendance", requireAdmin, async (req, res) => {
    try {
      const att = await storage.getAllAttendance();
      res.json({ attendance: att });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/cases", requireAdmin, async (req, res) => {
    try {
      await storage.createLoanCase(req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/agent/:agentId/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAgentStats(Number(req.params.agentId));
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/bkt-performance", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(BKT_PERF_SQL);
      res.json({ agents: result.rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/bkt-performance", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const result = await storage.query(
        `SELECT
           COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt1')::int AS bkt1_count,
           COUNT(bc.id) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status = 'Paid')::int AS bkt1_paid_count,
           COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1'), 0) AS bkt1_pos_total,
           COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status = 'Paid'), 0) AS bkt1_pos_paid,
           COALESCE(SUM(bc.pos::numeric) FILTER (WHERE bc.case_category = 'bkt1' AND bc.status <> 'Paid'), 0) AS bkt1_pos_unpaid
         FROM bkt_cases bc WHERE bc.agent_id = $1`,
        [agentId]
      );
      res.json(result.rows[0] || {});
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/bkt-cases", requireAdmin, async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const cases = await storage.getAllBktCases(category);
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/bkt-cases", requireAuth, async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const cases = await storage.getBktCasesByAgent(req.session.agentId!, category);
      res.json({ cases });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/bkt-cases/:id/feedback", requireAuth, async (req, res) => {
    try {
      const { status, feedback, comments, ptp_date, rollback_yn } = req.body;
      const ynVal = rollback_yn === true || rollback_yn === "true" ? true : rollback_yn === false || rollback_yn === "false" ? false : null;
      const caseId = Number(req.params.id);
      const oldRow = await storage.query(
        `SELECT status, rollback_yn, pos::numeric AS pos, agent_id, case_category, pro FROM bkt_cases WHERE id = $1`,
        [caseId]
      );
      const old = oldRow.rows[0];
      await storage.updateBktCaseFeedback(caseId, status, feedback, comments, ptp_date, ynVal);
      if (old && old.case_category && old.agent_id && (old.pro || "").toUpperCase() !== "UC") {
        const pos    = parseFloat(old.pos) || 0;
        const bktKey = (old.case_category as string).toLowerCase().replace(/\s+/g, "");
        const wasPaid = old.status === "Paid";
        const nowPaid = status === "Paid";
        const wasRb   = old.rollback_yn === true;
        const nowRb   = ynVal === true;
        const dPos    = !wasPaid && nowPaid ? pos : wasPaid && !nowPaid ? -pos : 0;
        const dCount  = !wasPaid && nowPaid ? 1  : wasPaid && !nowPaid ? -1  : 0;
        const dRb     = !wasRb  && nowRb   ? pos : wasRb  && !nowRb   ? -pos : 0;
        await storage.applyBktPerfDelta(old.agent_id, bktKey, dPos, -dPos, dCount, -dCount, dRb, -dRb);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Excel Import
  app.post("/api/admin/import", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook1 = new ExcelJS.Workbook();
      await ejWorkbook1.xlsx.load(req.file.buffer);
      const worksheet1 = ejWorkbook1.worksheets[0];
      const rawRows: any[][] = worksheetToRows(worksheet1, true);
      if (rawRows.length === 0) return res.json({ imported: 0, updated: 0, skipped: 0, agentsCreated: 0, errors: [] });
      let headerRowIdx = -1;
      let colIdxMap: Record<number, string> = {};
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const row = rawRows[r];
        const tempMap: Record<number, string> = {};
        let matched = 0;
        for (let c = 0; c < row.length; c++) {
          const norm = normalizeHeader(String(row[c] || ""));
          if (COLUMN_MAP[norm]) { tempMap[c] = COLUMN_MAP[norm]; matched++; }
        }
        if (matched >= 3) { headerRowIdx = r; colIdxMap = tempMap; break; }
      }
      if (headerRowIdx === -1) {
        return res.status(400).json({ message: "Could not find header row. Expected columns like: LOAN NO, CUSTOMER NAME, FOS NAME, POS, BKT" });
      }
      const ptpLoanSave = await storage.query(`SELECT loan_no, ptp_date FROM loan_cases WHERE status = 'PTP'`);
      const ptpLoanMap = new Map<string, string | null>(ptpLoanSave.rows.map((r: any) => [r.loan_no, r.ptp_date]));
      await storage.deleteAllLoanCases();
      const existingAgents = await storage.getAllAgentsWithAdmin();
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) {
        if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id;
      }
      let imported = 0, skipped = 0, agentsCreated = 0;
      const errors: string[] = [];
      const dataRows = rawRows.slice(headerRowIdx + 1);
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const mapped: Record<string, any> = {};
        for (const [colIdx, dbField] of Object.entries(colIdxMap)) {
          const val = row[Number(colIdx)];
          mapped[dbField] = (val !== undefined && val !== "") ? String(val).trim() : null;
        }
        if (!mapped.loan_no) { skipped++; continue; }
        if (!mapped.customer_name) { skipped++; continue; }
        if (isRepeatHeaderRow(mapped)) { skipped++; continue; }
        let agentId: number | null = null;
        if (mapped.fos_name) {
          const fosLower = mapped.fos_name.toLowerCase().trim();
          if (agentByName[fosLower]) {
            agentId = agentByName[fosLower];
          } else {
            try {
              const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
              const newAgent = await storage.createFosAgent({ name: mapped.fos_name, username, password: randomBytes(16).toString("hex") });
              agentByName[fosLower] = newAgent.id;
              agentId = newAgent.id;
              agentsCreated++;
            } catch {
              const found = await storage.getAgentByUsername(
                mapped.fos_name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")
              );
              if (found) { agentByName[fosLower] = found.id; agentId = found.id; }
            }
          }
        }
        try {
          await storage.upsertLoanCase({
            agentId, fosName: mapped.fos_name || null, loanNo: mapped.loan_no,
            customerName: mapped.customer_name, bkt: mapped.bkt ? parseInt(mapped.bkt) || null : null,
            appId: mapped.app_id || null, address: mapped.address || null, mobileNo: mapped.mobile_no || null,
            referenceAddress: mapped.reference_address || null, pos: parseNum(mapped.pos),
            assetMake: mapped.asset_make || null, registrationNo: mapped.registration_no || null,
            engineNo: mapped.engine_no || null, chassisNo: mapped.chassis_no || null,
            emiAmount: parseNum(mapped.emi_amount), emiDue: parseNum(mapped.emi_due),
            cbc: parseNum(mapped.cbc), lpp: parseNum(mapped.lpp), cbcLpp: parseNum(mapped.cbc_lpp),
            rollback: parseNum(mapped.rollback), clearance: parseNum(mapped.clearance),
            firstEmiDueDate: parseDate(mapped.first_emi_due_date), loanMaturityDate: parseDate(mapped.loan_maturity_date),
            tenor: mapped.tenor ? parseInt(mapped.tenor) || null : null, pro: mapped.pro || null,
            status: normalizeStatus(mapped.status), latestFeedback: mapped.latest_feedback || null,
            feedbackComments: mapped.feedback_comments || null, telecallerPtpDate: parseDate(mapped.telecaller_ptp_date),
          });
          imported++;
        } catch (e: any) {
          errors.push(`Row ${i + headerRowIdx + 2}: ${e.message}`);
          skipped++;
        }
      }
      for (const [loanNo, ptpDate] of ptpLoanMap) {
        await storage.query(`UPDATE loan_cases SET status = 'PTP', ptp_date = $1 WHERE loan_no = $2`, [ptpDate, loanNo]);
      }
      res.json({ imported, updated: 0, skipped, agentsCreated, total: dataRows.length, errors: errors.slice(0, 20) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // BKT / Penal Excel Import
  app.post("/api/admin/import-bkt", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook2 = new ExcelJS.Workbook();
      await ejWorkbook2.xlsx.load(req.file.buffer);
      const worksheet2 = ejWorkbook2.worksheets.find(ws => ws.name.toUpperCase() === "ALLO") || ejWorkbook2.worksheets[0];
      const rawRows: any[][] = worksheetToRows(worksheet2, true);
      if (rawRows.length === 0) return res.json({ imported: 0, updated: 0, skipped: 0, agentsCreated: 0, errors: [] });
      let headerRowIdx = -1;
      let colIdxMap: Record<number, string> = {};
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const row = rawRows[r];
        const tempMap: Record<number, string> = {};
        let matched = 0;
        for (let c = 0; c < row.length; c++) {
          const norm = normalizeHeader(String(row[c] || ""));
          if (COLUMN_MAP[norm]) { tempMap[c] = COLUMN_MAP[norm]; matched++; }
        }
        if (matched >= 3) { headerRowIdx = r; colIdxMap = tempMap; break; }
      }
      if (headerRowIdx === -1) {
        return res.status(400).json({ message: "Could not find header row." });
      }
      const ptpBktSave = await storage.query(`SELECT loan_no, ptp_date FROM bkt_cases WHERE status = 'PTP'`);
      const ptpBktMap = new Map<string, string | null>(ptpBktSave.rows.map((r: any) => [r.loan_no, r.ptp_date]));
      await storage.deleteAllBktCases();
      const existingAgents = await storage.getAllAgentsWithAdmin();
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) {
        if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id;
      }
      let imported = 0, skipped = 0, agentsCreated = 0;
      const errors: string[] = [];
      const dataRows = rawRows.slice(headerRowIdx + 1);
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const mapped: Record<string, any> = {};
        for (const [colIdx, dbField] of Object.entries(colIdxMap)) {
          const val = row[Number(colIdx)];
          mapped[dbField] = (val !== undefined && val !== "") ? String(val).trim() : null;
        }
        if (!mapped.loan_no) { skipped++; continue; }
        if (!mapped.customer_name) { skipped++; continue; }
        if (isRepeatHeaderRow(mapped)) { skipped++; continue; }
        const bktVal = mapped.bkt ? parseInt(mapped.bkt) : null;
        let caseCategory = "penal";
        if (bktVal === 1) caseCategory = "bkt1";
        else if (bktVal === 2) caseCategory = "bkt2";
        else if (bktVal === 3) caseCategory = "bkt3";
        let agentId: number | null = null;
        if (mapped.fos_name) {
          const fosLower = mapped.fos_name.toLowerCase().trim();
          if (agentByName[fosLower]) {
            agentId = agentByName[fosLower];
          } else {
            try {
              const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
              const newAgent = await storage.createFosAgent({ name: mapped.fos_name, username, password: randomBytes(16).toString("hex") });
              agentByName[fosLower] = newAgent.id;
              agentId = newAgent.id;
              agentsCreated++;
            } catch {
              const found = await storage.getAgentByUsername(
                mapped.fos_name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")
              );
              if (found) { agentByName[mapped.fos_name.toLowerCase().trim()] = found.id; agentId = found.id; }
            }
          }
        }
        try {
          await storage.upsertBktCase({
            caseCategory, agentId, fosName: mapped.fos_name || null, loanNo: mapped.loan_no,
            customerName: mapped.customer_name, bkt: bktVal, appId: mapped.app_id || null,
            address: mapped.address || null, mobileNo: mapped.mobile_no || null,
            ref1Name: mapped.ref1_name || null, ref1Mobile: mapped.ref1_mobile || null,
            ref2Name: mapped.ref2_name || null, ref2Mobile: mapped.ref2_mobile || null,
            referenceAddress: mapped.reference_address || null, pos: parseNum(mapped.pos),
            assetName: mapped.asset_name || null, assetMake: mapped.asset_make || null,
            registrationNo: mapped.registration_no || null, engineNo: mapped.engine_no || null,
            chassisNo: mapped.chassis_no || null, emiAmount: parseNum(mapped.emi_amount),
            emiDue: parseNum(mapped.emi_due), cbc: parseNum(mapped.cbc), lpp: parseNum(mapped.lpp),
            cbcLpp: parseNum(mapped.cbc_lpp), rollback: parseNum(mapped.rollback),
            clearance: parseNum(mapped.clearance), firstEmiDueDate: parseDate(mapped.first_emi_due_date),
            loanMaturityDate: parseDate(mapped.loan_maturity_date),
            tenor: mapped.tenor ? parseInt(mapped.tenor) || null : null, pro: mapped.pro || null,
            status: normalizeStatus(mapped.status), telecallerPtpDate: parseDate(mapped.telecaller_ptp_date),
          });
          imported++;
        } catch (e: any) {
          errors.push(`Row ${i + headerRowIdx + 2}: ${e.message}`);
          skipped++;
        }
      }
      for (const [loanNo, ptpDate] of ptpBktMap) {
        await storage.query(`UPDATE bkt_cases SET status = 'PTP', ptp_date = $1 WHERE loan_no = $2`, [ptpDate, loanNo]);
      }
      res.json({ imported, updated: 0, skipped, agentsCreated, total: dataRows.length, errors: errors.slice(0, 20) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // PTP Export
  app.get("/api/admin/ptp-export", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`
        SELECT fa.name AS fos_name, lc.customer_name, lc.loan_no, lc.mobile_no,
               lc.address, lc.ptp_date, lc.telecaller_ptp_date, lc.pos, lc.bkt::text AS bkt, lc.status
        FROM loan_cases lc LEFT JOIN fos_agents fa ON lc.agent_id = fa.id
        WHERE lc.status = 'PTP' OR lc.telecaller_ptp_date IS NOT NULL
        UNION ALL
        SELECT fa.name AS fos_name, bc.customer_name, bc.loan_no, bc.mobile_no,
               bc.address, bc.ptp_date, bc.telecaller_ptp_date, bc.pos, bc.case_category AS bkt, bc.status
        FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id = fa.id
        WHERE bc.status = 'PTP' OR bc.telecaller_ptp_date IS NOT NULL
        ORDER BY fos_name NULLS LAST, telecaller_ptp_date NULLS LAST
      `);
      const rows = result.rows.map((r: any) => ({
        "FOS Name": r.fos_name || "", "Customer Name": r.customer_name || "",
        "Loan No": r.loan_no || "", "Mobile No": r.mobile_no || "", "Address": r.address || "",
        "Telecaller PTP Date": r.telecaller_ptp_date ? String(r.telecaller_ptp_date).slice(0, 10) : "",
        "FOS PTP Date": r.ptp_date ? String(r.ptp_date).slice(0, 10) : "",
        "POS": r.pos || "", "BKT": r.bkt || "", "Status": r.status || "",
      }));
      const exportWb = new ExcelJS.Workbook();
      const exportWs = exportWb.addWorksheet("PTP Cases");
      const exportRows = rows.length ? rows : [{ "FOS Name": "No PTP cases found" }];
      exportWs.columns = Object.keys(exportRows[0]).map(key => ({ header: key, key }));
      exportRows.forEach(row => exportWs.addRow(row));
      const buf = await exportWb.xlsx.writeBuffer();
      res.setHeader("Content-Disposition", `attachment; filename="PTP_Report_${new Date().toISOString().slice(0,10)}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/clear-ptp", requireAdmin, async (req, res) => {
    try {
      await storage.query(`UPDATE loan_cases SET ptp_date = NULL, telecaller_ptp_date = NULL, status = 'Pending' WHERE status = 'PTP'`);
      await storage.query(`UPDATE bkt_cases SET ptp_date = NULL, telecaller_ptp_date = NULL, status = 'Pending' WHERE status = 'PTP'`);
      await storage.query(`UPDATE loan_cases SET ptp_date = NULL, telecaller_ptp_date = NULL WHERE ptp_date IS NOT NULL OR telecaller_ptp_date IS NOT NULL`);
      await storage.query(`UPDATE bkt_cases SET ptp_date = NULL, telecaller_ptp_date = NULL WHERE ptp_date IS NOT NULL OR telecaller_ptp_date IS NOT NULL`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/admin/bkt-perf-summary", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`
        WITH norm AS (
          SELECT *, CASE LOWER(REPLACE(bkt, ' ', ''))
            WHEN '1' THEN 'bkt1' WHEN '2' THEN 'bkt2' WHEN '3' THEN 'bkt3'
            WHEN 'bkt1' THEN 'bkt1' WHEN 'bkt2' THEN 'bkt2' WHEN 'bkt3' THEN 'bkt3'
            ELSE LOWER(REPLACE(bkt, ' ', '')) END AS bkt_norm
          FROM bkt_perf_summary
        ),
        latest AS (
          SELECT DISTINCT ON (fos_name, bkt_norm) * FROM norm
          ORDER BY fos_name, bkt_norm, uploaded_at DESC
        )
        SELECT fos_name, bkt_norm AS bkt,
          COALESCE(pos_paid, 0) AS pos_paid, COALESCE(pos_unpaid, 0) AS pos_unpaid,
          COALESCE(pos_grand_total, 0) AS pos_grand_total, COALESCE(pos_percentage, 0) AS pos_percentage,
          COALESCE(count_paid, 0) AS count_paid, COALESCE(count_unpaid, 0) AS count_unpaid,
          COALESCE(count_total, 0) AS count_total, COALESCE(rollback_paid, 0) AS rollback_paid,
          COALESCE(rollback_unpaid, 0) AS rollback_unpaid, COALESCE(rollback_grand_total, 0) AS rollback_grand_total,
          COALESCE(rollback_percentage, 0) AS rollback_percentage
        FROM latest ORDER BY fos_name, bkt_norm
      `);
      res.json({ rows: result.rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // BKT Perf Summary — FOS own data
  app.get("/api/bkt-perf-summary", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      console.log("[bkt-perf-summary] agentId from session:", agentId);

      const checkResult = await storage.query(
        `SELECT COUNT(*) as cnt FROM bkt_perf_summary WHERE agent_id = $1`,
        [agentId]
      );
      console.log("[bkt-perf-summary] rows in bkt_perf_summary for agent:", checkResult.rows[0]?.cnt);

      const result = await storage.query(`
        WITH
        imported_norm AS (
          SELECT *,
            CASE LOWER(REPLACE(bkt, ' ', ''))
              WHEN '1' THEN 'bkt1' WHEN '2' THEN 'bkt2' WHEN '3' THEN 'bkt3'
              WHEN 'bkt1' THEN 'bkt1' WHEN 'bkt2' THEN 'bkt2' WHEN 'bkt3' THEN 'bkt3'
              ELSE LOWER(REPLACE(bkt, ' ', ''))
            END AS bkt_norm
          FROM bkt_perf_summary
          WHERE agent_id = $1
        ),
        imported_latest AS (
          SELECT DISTINCT ON (bkt_norm) * FROM imported_norm
          ORDER BY bkt_norm, uploaded_at DESC
        ),
        covered_bkts AS (
          SELECT bkt_norm FROM imported_latest
          WHERE bkt_norm IN ('bkt1','bkt2','bkt3')
        ),
        live_cases AS (
          SELECT LOWER(REPLACE(bc.case_category,' ','')) AS bkt,
                 bc.pos::numeric AS pos, bc.status, bc.rollback_yn
          FROM bkt_cases bc
          WHERE bc.agent_id = $1
            AND LOWER(REPLACE(bc.case_category,' ','')) IN ('bkt1','bkt2','bkt3')
            AND LOWER(REPLACE(bc.case_category,' ','')) NOT IN (SELECT bkt_norm FROM covered_bkts)
            AND UPPER(COALESCE(bc.pro,'')) <> 'UC'
          UNION ALL
          SELECT 'bkt' || lc.bkt::text AS bkt,
                 lc.pos::numeric AS pos, lc.status, lc.rollback_yn
          FROM loan_cases lc
          WHERE lc.agent_id = $1
            AND lc.bkt IS NOT NULL
            AND 'bkt' || lc.bkt::text NOT IN (SELECT bkt_norm FROM covered_bkts)
            AND UPPER(COALESCE(lc.pro,'')) <> 'UC'
        ),
        live_agg AS (
          SELECT bkt,
            COALESCE(SUM(pos) FILTER (WHERE status = 'Paid'), 0) AS pos_paid,
            COALESCE(SUM(pos) FILTER (WHERE status <> 'Paid'), 0) AS pos_unpaid,
            COALESCE(SUM(pos), 0) AS pos_grand_total,
            CASE WHEN COALESCE(SUM(pos),0) > 0
              THEN ROUND((COALESCE(SUM(pos) FILTER (WHERE status='Paid'),0)/SUM(pos))*100,2)
              ELSE 0 END AS pos_percentage,
            COUNT(*) FILTER (WHERE status = 'Paid')::int AS count_paid,
            COUNT(*) FILTER (WHERE status <> 'Paid')::int AS count_unpaid,
            COUNT(*)::int AS count_total,
            COALESCE(SUM(pos) FILTER (WHERE rollback_yn = true), 0) AS rollback_paid,
            COALESCE(SUM(pos) FILTER (WHERE rollback_yn IS DISTINCT FROM true), 0) AS rollback_unpaid,
            COALESCE(SUM(pos), 0) AS rollback_grand_total,
            CASE WHEN COALESCE(SUM(pos),0) > 0
              THEN ROUND((COALESCE(SUM(pos) FILTER (WHERE rollback_yn=true),0)/SUM(pos))*100,2)
              ELSE 0 END AS rollback_percentage
          FROM live_cases GROUP BY bkt
        ),
        combined AS (
          SELECT bkt_norm AS bkt,
            COALESCE(pos_paid,0) AS pos_paid, COALESCE(pos_unpaid,0) AS pos_unpaid,
            COALESCE(pos_grand_total,0) AS pos_grand_total, COALESCE(pos_percentage,0) AS pos_percentage,
            COALESCE(count_paid,0) AS count_paid, COALESCE(count_unpaid,0) AS count_unpaid,
            COALESCE(count_total,0) AS count_total, COALESCE(rollback_paid,0) AS rollback_paid,
            COALESCE(rollback_unpaid,0) AS rollback_unpaid, COALESCE(rollback_grand_total,0) AS rollback_grand_total,
            COALESCE(rollback_percentage,0) AS rollback_percentage
          FROM imported_latest
          UNION ALL
          SELECT * FROM live_agg
        )
        SELECT * FROM combined ORDER BY bkt
      `, [agentId]);

      console.log("[bkt-perf-summary] rows returned:", result.rows.length);
      res.json({ rows: result.rows });
    } catch (e: any) {
      console.error("[bkt-perf-summary] error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // BKT Perf Summary — Excel import
  app.post("/api/admin/import-bkt-perf", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook3 = new ExcelJS.Workbook();
      await ejWorkbook3.xlsx.load(req.file.buffer);
      const worksheet3 = ejWorkbook3.worksheets[0];
      const rawRows: any[][] = worksheetToRows(worksheet3, false);
      if (rawRows.length === 0) return res.json({ imported: 0, skipped: 0, errors: [] });
      const cn = (v: any): number => {
        if (v === "" || v === null || v === undefined) return 0;
        return parseFloat(String(v).replace(/[,%₹\s]/g, "")) || 0;
      };
      const toPct = (v: any): number => {
        const raw = cn(v);
        return raw > 0 && raw <= 1 ? raw * 100 : raw;
      };
      const manualBkt = String(req.body?.bkt || "").trim();
      let bktValue = manualBkt || "";
      if (!bktValue) {
        for (const row of rawRows.slice(0, 15)) {
          for (let i = 0; i < row.length - 1; i++) {
            if (String(row[i]).toLowerCase().trim() === "bkt" && String(row[i + 1]).trim()) {
              bktValue = String(row[i + 1]).trim(); break;
            }
          }
          if (bktValue) break;
        }
      }
      if (!bktValue) bktValue = "1";
      bktValue = bktValue.toLowerCase().trim().replace(/\s+/g, "");
      if (bktValue === "1" || bktValue === "2" || bktValue === "3") bktValue = `bkt${bktValue}`;
      let headerIdx = -1;
      let cFos = -1, cVal = -1, cPaid = -1, cUnpaid = -1, cGt = -1, cPct = -1;
      let cRbVal = -1, cRb = -1, cRbGt = -1, cRbPct = -1;
      for (let r = 0; r < rawRows.length; r++) {
        const row = rawRows[r];
        const norm = (v: any) => String(v || "").toLowerCase().trim().replace(/[\s_]/g, "");
        const cells = row.map(norm);
        if (!cells.some(c => c === "values" || c === "value") || !cells.some(c => c === "paid")) continue;
        headerIdx = r;
        let fosCount = 0, valCount = 0, gtCount = 0, pctCount = 0;
        for (let j = 0; j < row.length; j++) {
          const c = cells[j];
          if (c === "fosname" || c === "fos_name" || c === "fosagent") { if (fosCount === 0) { cFos = j; fosCount++; } }
          else if (c === "values" || c === "value") { if (valCount === 0) { cVal = j; valCount++; } else if (valCount === 1) { cRbVal = j; valCount++; } }
          else if (c === "paid" && cPaid === -1) { cPaid = j; }
          else if (c === "unpaid" && cUnpaid === -1) { cUnpaid = j; }
          else if ((c === "grandtotal" || c.includes("grand")) && gtCount <= 1) { if (gtCount === 0) { cGt = j; gtCount++; } else { cRbGt = j; gtCount++; } }
          else if ((c === "percentage" || c.includes("percent")) && pctCount <= 1) { if (pctCount === 0) { cPct = j; pctCount++; } else { cRbPct = j; pctCount++; } }
          else if (c.includes("rollback") || c === "rb") { cRb = j; }
        }
        break;
      }
      if (headerIdx === -1) {
        return res.status(400).json({ message: "Could not find header row. Expected columns: Fos_Name, Values, PAID, UNPAID, Grand Total, Percentage, RollBack" });
      }
      const fosData: Record<string, any> = {};
      let currentFos = "";
      for (let r = headerIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        const fosCell = cFos >= 0 ? String(row[cFos] || "").trim() : "";
        const valCell = cVal >= 0 ? String(row[cVal] || "").trim().toLowerCase() : "";
        if (fosCell.toLowerCase().includes("grand total")) continue;
        if (fosCell && fosCell.toLowerCase() !== "grand total") currentFos = fosCell;
        if (!currentFos || !valCell) continue;
        if (!fosData[currentFos]) {
          fosData[currentFos] = { posPaid: 0, posUnpaid: 0, posGrandTotal: 0, posPercentage: 0, countPaid: 0, countUnpaid: 0, countTotal: 0, rollbackPaid: 0, rollbackGrandTotal: 0, rollbackPercentage: 0 };
        }
        const d = fosData[currentFos];
        if (valCell.includes("sum of pos") || valCell.includes("sum of po")) {
          d.posPaid = cPaid >= 0 ? cn(row[cPaid]) : d.posPaid;
          d.posUnpaid = cUnpaid >= 0 ? cn(row[cUnpaid]) : d.posUnpaid;
          d.posGrandTotal = cGt >= 0 ? cn(row[cGt]) : d.posGrandTotal;
          d.posPercentage = cPct >= 0 ? toPct(row[cPct]) : d.posPercentage;
          d.rollbackPaid = cRb >= 0 ? cn(row[cRb]) : d.rollbackPaid;
          d.rollbackGrandTotal = cRbGt >= 0 ? cn(row[cRbGt]) : d.rollbackGrandTotal;
          d.rollbackPercentage = cRbPct >= 0 ? toPct(row[cRbPct]) : d.rollbackPercentage;
        } else if (valCell.includes("cbc+lpp") || valCell.includes("cbclpp") || valCell.includes("cbc lpp") || valCell.includes("sum of cbc") || (valCell.includes("cbc") && valCell.includes("lpp"))) {
          d.posPaid = cPaid >= 0 ? cn(row[cPaid]) : d.posPaid;
          d.posUnpaid = cUnpaid >= 0 ? cn(row[cUnpaid]) : d.posUnpaid;
          d.posGrandTotal = cGt >= 0 ? cn(row[cGt]) : d.posGrandTotal;
          d.posPercentage = cPct >= 0 ? toPct(row[cPct]) : d.posPercentage;
        } else if (valCell.includes("count") || valCell.includes("col cbc") || valCell.includes("col_cbc") || (valCell.includes("col") && valCell.includes("cbc")) || valCell === "sum of col cbc" || valCell === "col cbc") {
          d.countPaid = cPaid >= 0 ? Math.round(cn(row[cPaid])) : d.countPaid;
          d.countUnpaid = cUnpaid >= 0 ? Math.round(cn(row[cUnpaid])) : d.countUnpaid;
          d.countTotal = cGt >= 0 ? Math.round(cn(row[cGt])) : d.countTotal;
        }
      }
      const existingAgents = await storage.getAllAgentsWithAdmin();
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) {
        if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id;
      }
      let imported = 0, skipped = 0;
      const errors: string[] = [];
      const fosNames = Object.keys(fosData);
      for (let i = 0; i < fosNames.length; i++) {
        const fosName = fosNames[i];
        const d = fosData[fosName];
        if (bktValue === "penal") d.posGrandTotal = d.posPaid + d.posUnpaid;
        const fosLower = fosName.toLowerCase();
        let agentId: number | null = agentByName[fosLower] || null;
        if (!agentId) {
          try {
            const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
            const newAgent = await storage.createFosAgent({ name: fosName, username, password: randomBytes(16).toString("hex") });
            agentByName[fosLower] = newAgent.id; agentId = newAgent.id;
          } catch {
            const uname = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
            const found = await storage.getAgentByUsername(uname);
            if (found) { agentByName[fosLower] = found.id; agentId = found.id; }
          }
        }
        try {
          await storage.upsertBktPerfSummary({
            fosName, agentId, bkt: bktValue,
            posPaid: d.posPaid, posUnpaid: d.posUnpaid, posGrandTotal: d.posGrandTotal, posPercentage: d.posPercentage,
            countPaid: d.countPaid, countUnpaid: d.countUnpaid, countTotal: d.countTotal,
            rollbackPaid: d.rollbackPaid, rollbackUnpaid: Math.max(0, d.rollbackGrandTotal - d.rollbackPaid),
            rollbackGrandTotal: d.rollbackGrandTotal, rollbackPercentage: d.rollbackPercentage,
          });
          imported++;
        } catch (e: any) {
          errors.push(`${fosName}: ${e.message}`); skipped++;
        }
      }
      res.json({ imported, skipped, total: fosNames.length, bkt: bktValue, errors: errors.slice(0, 20) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Background job: daily PTP push at 9 AM
  const ptpReminderSentDates = new Set<string>();
  async function runPtpPushJob() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const todayKey = now.toISOString().slice(0, 10);
      if (hour !== 9 || ptpReminderSentDates.has(todayKey)) return;
      const agents = await storage.query(`SELECT id, name, push_token FROM fos_agents WHERE role = 'fos' AND push_token IS NOT NULL AND push_token <> ''`);
      for (const agent of agents.rows) {
        const result = await storage.query(`
          SELECT COUNT(*) AS cnt FROM (
            SELECT id FROM loan_cases WHERE agent_id = $1 AND ((status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE)) OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE))
            UNION ALL
            SELECT id FROM bkt_cases WHERE agent_id = $1 AND ((status = 'PTP' AND (ptp_date IS NULL OR ptp_date <= CURRENT_DATE)) OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date <= CURRENT_DATE))
          ) t
        `, [agent.id]);
        const cnt = parseInt(result.rows[0]?.cnt || "0", 10);
        if (cnt > 0) {
          await sendExpoPush(agent.push_token, "📅 PTP Due Today", `You have ${cnt} PTP case${cnt !== 1 ? "s" : ""} due today. Open the app to follow up now.`, { screen: "dashboard" });
        }
      }
      ptpReminderSentDates.add(todayKey);
    } catch (_) {}
  }
  runPtpPushJob();
  setInterval(runPtpPushJob, 30 * 60 * 1000);

  // Background job: deposits overdue by 2h
  async function runReminderJob() {
    try {
      const result = await storage.query(`
        SELECT rd.id, rd.agent_id, rd.amount, fa.push_token
        FROM required_deposits rd JOIN fos_agents fa ON fa.id = rd.agent_id
        WHERE rd.screenshot_url IS NULL AND rd.reminder_sent = FALSE
          AND rd.created_at < NOW() - INTERVAL '2 hours'
          AND fa.push_token IS NOT NULL AND fa.push_token <> ''
      `);
      for (const row of result.rows) {
        await sendExpoPush(row.push_token, "⏰ Deposit Screenshot Overdue", `You have not uploaded your payment screenshot for ₹${parseFloat(row.amount).toLocaleString("en-IN")}. Please upload it now.`);
        await storage.query(`UPDATE required_deposits SET reminder_sent = TRUE WHERE id = $1`, [row.id]);
      }
    } catch (_) {}
  }
  runReminderJob();
  setInterval(runReminderJob, 5 * 60 * 1000);

  const httpServer = createServer(app);
  return httpServer;
}
