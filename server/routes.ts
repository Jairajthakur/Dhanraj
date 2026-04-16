import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes, createHmac } from "node:crypto";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import ExcelJS from "exceljs";
import * as storage from "./storage";
import path from "node:path";
import fs from "node:fs";
import express from "express";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "fos-jwt-secret-2024";

function base64url(str: string): string {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function signToken(payload: { agentId: number; role: string }): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): { agentId: number; role: string } | null {
  try {
    const [header, body, sig] = token.split(".");
    const expected = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    const GRACE = 2 * 24 * 3600;
    if (payload.exp && payload.exp + GRACE < Math.floor(Date.now() / 1000)) return null;
    return { agentId: payload.agentId, role: payload.role };
  } catch { return null; }
}


function worksheetToRows(worksheet: ExcelJS.Worksheet, rawStrings: boolean): any[][] {
  const rawRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowVals = row.values as any[];
    const maxCol = rowVals.length - 1;
    const vals: any[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const v = rowVals[c];
      if (v === null || v === undefined) { vals.push(""); }
      else if (typeof v === "object") {
        if (Array.isArray(v.richText)) vals.push(v.richText.map((r: any) => r.text).join(""));
        else if (v.result !== undefined) vals.push(rawStrings ? String(v.result) : v.result);
        else if (v.text !== undefined) vals.push(String(v.text));
        else if (v instanceof Date) vals.push(rawStrings ? v.toISOString().slice(0, 10) : v);
        else vals.push(rawStrings ? String(v) : v);
      } else { vals.push(rawStrings ? String(v) : v); }
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

function getISTHour(): { hour: number; todayKey: string } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return { hour: ist.getUTCHours(), todayKey: ist.toISOString().slice(0, 10) };
}

async function sendPush(playerId: string, title: string, body: string, data: Record<string, any> = {}): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) { console.warn("[push] ⚠️ ONESIGNAL not configured"); return { ok: false, error: "not_configured" }; }
  if (!playerId?.trim()) { console.warn("[push] ⚠️ No playerId provided for:", title); return { ok: false, error: "no_player_id" }; }
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { onesignal_id: [playerId.trim()] },
        headings: { en: title },
        contents: { en: body },
        data,
        priority: 10,
        ttl: 259200,
        android_visibility: 1,
        large_icon: "ic_launcher",
        small_icon: "ic_stat_onesignal_default",
        android_accent_color: "FFFF6B00",
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) {
      const err = Array.isArray(json.errors) ? json.errors[0] : JSON.stringify(json.errors);
      console.error("[push] ❌ Failed:", err, "| title:", title, "| player:", playerId.slice(0, 20));
      return { ok: false, error: err };
    }
    console.log(`[push] ✅ Sent "${title}" → ${playerId.slice(0, 20)}... | recipients: ${json.recipients ?? "?"}`);
    return { ok: true };
  } catch (e: any) {
    console.error("[push] ❌ Exception:", e.message);
    return { ok: false, error: e.message };
  }
}

async function sendPushToMany(playerIds: string[], title: string, body: string, data: Record<string, any> = {}): Promise<{ sent: number; total: number }> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey || playerIds.length === 0) { console.warn("[push-many] ⚠️ OneSignal not configured or no playerIds for:", title); return { sent: 0, total: 0 }; }
  const validIds = playerIds.filter((id) => id?.trim());
  console.log(`[push-many] Sending "${title}" to ${validIds.length} devices`);
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${apiKey}` },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        include_aliases: { onesignal_id: validIds },
        headings: { en: title },
        contents: { en: body },
        data,
        priority: 10,
        ttl: 259200,
        android_visibility: 1,
        large_icon: "ic_launcher",
        small_icon: "ic_stat_onesignal_default",
        android_accent_color: "FFFF6B00",
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    const sent = json.recipients ?? validIds.length;
    console.log(`[push-many] ✅ Sent to ${sent}/${validIds.length} | errors: ${JSON.stringify(json.errors ?? "none")}`);
    return { sent, total: validIds.length };
  } catch (e: any) {
    console.error("[push-many] ❌ Exception:", e.message);
    return { sent: 0, total: playerIds.length };
  }
}

async function extractAmountFromScreenshot(imagePath: string): Promise<number | null> {
  try {
    let Tesseract: any;
    try { Tesseract = require("tesseract.js"); } catch { console.warn("[ocr] tesseract.js not installed"); return null; }
    const { data: { text } } = await Tesseract.recognize(imagePath, "eng", { logger: () => {} });
    const patterns = [
      /(?:amount|paid|debited|transferred|sent|credited|total)[^\d₹Rs]{0,10}[₹Rs\.]{0,3}\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
      /₹\s*([0-9,]+(?:\.[0-9]{1,2})?)/g,
      /Rs\.?\s+([0-9,]+(?:\.[0-9]{1,2})?)/gi,
      /INR\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
      /\b([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)\b/g,
    ];
    const candidates: number[] = [];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const num = parseFloat(match[1].replace(/,/g, ""));
        if (!isNaN(num) && num > 0 && num < 10_000_000) candidates.push(num);
      }
    }
    if (candidates.length === 0) return null;
    const freq: Record<string, number> = {};
    for (const c of candidates) { const key = c.toFixed(2); freq[key] = (freq[key] || 0) + 1; }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1] || parseFloat(b[0]) - parseFloat(a[0]));
    return parseFloat(sorted[0][0]);
  } catch { return null; }
}

function amountMatches(expected: number, actual: number): boolean { return Math.round(expected) === Math.round(actual); }
function normalizeHeader(h: string): string { return h.toString().toLowerCase().replace(/[\s_\-\.\/\\+]/g, ""); }
function parseNum(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim().replace(/,/g, ""); if (!s) return null;
  const n = Number(s); if (isNaN(n)) return null; return s;
}
function normalizeStatus(val: any): string {
  const s = String(val || "").trim().toUpperCase();
  if (s === "TRUE" || s === "PAID" || s === "YES" || s === "1") return "Paid";
  if (s === "FALSE" || s === "UNPAID" || s === "NO" || s === "0") return "Unpaid";
  if (s === "PTP") return "PTP";
  const raw = String(val || "").trim();
  if (raw === "Paid" || raw === "Unpaid" || raw === "PTP") return raw;
  if (raw === "Follow Up" || raw === "FOLLOW UP" || raw === "FOLLOWUP") return "Unpaid";
  return "Unpaid";
}
function parseDate(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim(); if (!s) return null;
  const ddmmyyyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
  const d = new Date(s); if (isNaN(d.getTime())) return null; return s;
}
function isRollbackText(val: any): boolean {
  if (val === null || val === undefined || val === "") return false;
  const s = String(val).trim().toLowerCase().replace(/[\s_\-]/g, "");
  return s === "rollback" || s === "rb" || s === "yes" || s === "y" || s === "true" || s === "1";
}
function parseRollbackYn(val: any): boolean | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (isNaN(Number(s.replace(/,/g, ""))) || isRollbackText(s)) return isRollbackText(s) ? true : null;
  const n = parseFloat(s.replace(/,/g, ""));
  return n > 0 ? true : null;
}

const HEADER_SENTINEL = new Set(["loan no", "loanno", "loan number", "customer name", "customername", "fos name", "fosname", "fos_name", "rollback", "emi", "pos"]);
function isRepeatHeaderRow(mapped: Record<string, any>): boolean {
  const loanNo = String(mapped.loan_no || "").toLowerCase().trim();
  return HEADER_SENTINEL.has(loanNo) || loanNo === "loan no" || loanNo === "s.no" || /^s\.?\s*no\.?$/i.test(loanNo);
}

// ─── COLUMN_MAP: added company_name mappings ──────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  loanno: "loan_no", loannumber: "loan_no", appid: "app_id", applicationid: "app_id", appno: "app_id",
  customername: "customer_name", applicantname: "customer_name", name: "customer_name",
  emi: "emi_amount", emiamount: "emi_amount", emidue: "emi_due",
  cbc: "cbc", lpp: "lpp", cbclpp: "cbc_lpp", cbclppamount: "cbc_lpp",
  pos: "pos", principaloutstanding: "pos", outstanding: "pos",
  bkt: "bkt", bucket: "bkt", rollback: "rollback", clearance: "clearance",
  address: "address", customeraddress: "address", custaddress: "address",
  customeradddress: "address", customeradress: "address", customeaddress: "address",
  firstemidueda: "first_emi_due_date", firstemiduedate: "first_emi_due_date", firstemidate: "first_emi_due_date",
  loanmaturitydate: "loan_maturity_date", maturitydate: "loan_maturity_date",
  assetmake: "asset_make", make: "asset_make",
  registrationno: "registration_no", regno: "registration_no", regNo: "registration_no",
  engineno: "engine_no", enginenumber: "engine_no",
  chassisno: "chassis_no", chassisnumber: "chassis_no",
  referenceaddress: "reference_address", refaddress: "reference_address",
  ten: "tenor", tenor: "tenor", tenure: "tenor", number: "mobile_no",
  pro: "pro", product: "pro",
  fosname: "fos_name", fos: "fos_name", fosagent: "fos_name", agent: "fos_name",
  mobileno: "mobile_no", mobile: "mobile_no", phone: "mobile_no", contactno: "mobile_no",
  status: "status",
  detailfb: "latest_feedback", fb: "latest_feedback", feedback: "latest_feedback",
  comments: "feedback_comments",
  ptpdate: "telecaller_ptp_date", ptp: "telecaller_ptp_date", ptpdt: "telecaller_ptp_date",
  promisetopaydatdate: "telecaller_ptp_date", promisetopaydate: "telecaller_ptp_date",
  // ── company_name mappings ──────────────────────────────────────────────────
  companyname: "company_name", company: "company_name", compname: "company_name",
  financecompany: "company_name", financeco: "company_name", lender: "company_name",
  nbfc: "company_name", bankname: "company_name", bank: "company_name",
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthToNumber(val: any): number {
  if (!val) return new Date().getMonth() + 1;
  const n = parseInt(String(val));
  if (!isNaN(n) && n >= 1 && n <= 12) return n;
  const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(val).toLowerCase().trim());
  return idx >= 0 ? idx + 1 : new Date().getMonth() + 1;
}

declare module "express-session" { interface SessionData { agentId?: number; role?: string; } }

async function recalcBktPerfFromAllocation(): Promise<void> {
  const result = await storage.query(`
    SELECT lc.agent_id, fa.name AS fos_name,
      CASE lc.bkt WHEN 1 THEN 'bkt1' WHEN 2 THEN 'bkt2' WHEN 3 THEN 'bkt3' ELSE NULL END AS bkt_key,
      COALESCE(SUM(lc.pos::numeric) FILTER (WHERE lc.status='Paid' OR (lc.clearance IS NOT NULL AND lc.clearance::numeric>0)),0) AS pos_paid,
      COALESCE(SUM(lc.pos::numeric) FILTER (WHERE lc.status!='Paid' AND (lc.clearance IS NULL OR lc.clearance::numeric=0)),0) AS pos_unpaid,
      COALESCE(SUM(lc.pos::numeric),0) AS pos_grand_total,
      COUNT(*) FILTER (WHERE lc.status='Paid' OR (lc.clearance IS NOT NULL AND lc.clearance::numeric>0))::int AS count_paid,
      COUNT(*) FILTER (WHERE lc.status!='Paid' AND (lc.clearance IS NULL OR lc.clearance::numeric=0))::int AS count_unpaid,
      COUNT(*)::int AS count_total,
      COALESCE(SUM(lc.pos::numeric) FILTER (WHERE lc.rollback_yn=true),0) AS rollback_paid,
      COALESCE(SUM(lc.pos::numeric) FILTER (WHERE lc.rollback_yn IS DISTINCT FROM true),0) AS rollback_unpaid,
      COALESCE(SUM(lc.pos::numeric),0) AS rollback_grand_total
    FROM loan_cases lc JOIN fos_agents fa ON fa.id=lc.agent_id
    WHERE lc.bkt IS NOT NULL AND lc.agent_id IS NOT NULL AND UPPER(COALESCE(lc.pro,'')) NOT IN ('UC','RUC')
    GROUP BY lc.agent_id, fa.name, lc.bkt
  `);
  let updated = 0;
  for (const row of result.rows) {
    if (!row.bkt_key) continue;
    const posGrandTotal = parseFloat(row.pos_grand_total) || 0;
    const posPaid = parseFloat(row.pos_paid) || 0;
    const posUnpaid = parseFloat(row.pos_unpaid) || 0;
    const posPercentage = posGrandTotal > 0 ? Math.round((posPaid / posGrandTotal) * 10000) / 100 : 0;
    const rbGrandTotal = parseFloat(row.rollback_grand_total) || 0;
    const rbPaid = parseFloat(row.rollback_paid) || 0;
    const rbUnpaid = parseFloat(row.rollback_unpaid) || 0;
    const rbPercentage = rbGrandTotal > 0 ? Math.round((rbPaid / rbGrandTotal) * 10000) / 100 : 0;
    await storage.query(
      `INSERT INTO bkt_perf_summary (fos_name,agent_id,bkt,pos_paid,pos_unpaid,pos_grand_total,pos_percentage,count_paid,count_unpaid,count_total,rollback_paid,rollback_unpaid,rollback_grand_total,rollback_percentage,uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (fos_name,bkt) DO UPDATE SET
         agent_id=EXCLUDED.agent_id, pos_paid=EXCLUDED.pos_paid, pos_unpaid=EXCLUDED.pos_unpaid,
         pos_grand_total=EXCLUDED.pos_grand_total, pos_percentage=EXCLUDED.pos_percentage,
         count_paid=EXCLUDED.count_paid, count_unpaid=EXCLUDED.count_unpaid, count_total=EXCLUDED.count_total,
         rollback_paid=EXCLUDED.rollback_paid, rollback_unpaid=EXCLUDED.rollback_unpaid,
         rollback_grand_total=EXCLUDED.rollback_grand_total, rollback_percentage=EXCLUDED.rollback_percentage,
         uploaded_at=NOW()`,
      [row.fos_name, row.agent_id, row.bkt_key, posPaid, posUnpaid, posGrandTotal, posPercentage,
       row.count_paid, row.count_unpaid, row.count_total, rbPaid, rbUnpaid, rbGrandTotal, rbPercentage]
    );
    updated++;
  }
  console.log(`[recalcBktPerf] ✅ Updated ${updated} agent/bkt combinations`);
}

async function safeDeleteAgent(agentId: number, context: string): Promise<void> {
  const tables = [
    { sql: `DELETE FROM loan_cases WHERE agent_id = $1`, name: "loan_cases" },
    { sql: `DELETE FROM bkt_cases WHERE agent_id = $1`, name: "bkt_cases" },
    { sql: `DELETE FROM bkt_perf_summary WHERE agent_id = $1`, name: "bkt_perf_summary" },
    { sql: `DELETE FROM attendance WHERE agent_id = $1`, name: "attendance" },
    { sql: `DELETE FROM required_deposits WHERE agent_id = $1`, name: "required_deposits" },
    { sql: `DELETE FROM fos_depositions WHERE agent_id = $1`, name: "fos_depositions" },
    { sql: `DELETE FROM salary_details WHERE agent_id = $1`, name: "salary_details" },
    { sql: `DELETE FROM depositions WHERE agent_id = $1`, name: "depositions" },
    { sql: `DELETE FROM call_recordings WHERE agent_id = $1`, name: "call_recordings" },
    { sql: `DELETE FROM user_sessions WHERE sess::text LIKE $1`, name: "user_sessions", param: `%"agentId":${agentId}%` },
    { sql: `DELETE FROM fos_agents WHERE id = $1`, name: "fos_agents" },
  ];
  for (const t of tables) {
    try {
      if (t.name === "user_sessions") { await storage.query(t.sql, [t.param]); }
      else { await storage.query(t.sql, [agentId]); }
    } catch (e: any) { console.warn(`[${context}] Skipping ${t.name} for agent ${agentId}: ${e.message}`); }
  }
}

function buildIntimationParams(body: Record<string, any>, isPost = false) {
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  return {
    customer_name:   body.customer_name   || "___________",
    address:         body.address         || "___________",
    app_id:          body.app_id          || "___________",
    loan_no:         body.loan_no         || "___________",
    registration_no: body.registration_no || "___________",
    asset_make:      body.asset_make      || "___________",
    engine_no:       body.engine_no       || "___________",
    chassis_no:      body.chassis_no      || "___________",
    date:            body.date            || today,
    police_station:  body.police_station  || "________________________________",
    tq:              body.tq              || "_____________",
    repossession_date:    body.repossession_date    || body.date || today,
    repossession_address: body.repossession_address || body.address || "___________",
    reference_no:         body.reference_no         || body.loan_no || "___________",
  };
}
 
function buildPreIntimationHtml(p: ReturnType<typeof buildIntimationParams>): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; padding: 40px 50px; line-height: 1.6; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 6px; }
    .divider { border: none; border-top: 1px solid #ccc; margin: 10px 0; }
    .date { font-weight: bold; margin-bottom: 16px; }
    .to-block { margin-left: 24px; margin-bottom: 14px; }
    .to-block p { margin-bottom: 2px; }
    .subject { margin-bottom: 14px; }
    .body-text { margin-bottom: 10px; text-align: justify; }
    .details-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    .details-table tr:nth-child(even) { background-color: #f8f8f8; }
    .details-table td { padding: 6px 10px; border: 1px solid #ddd; }
    .details-table td:first-child { width: 45%; color: #333; }
    .details-table td:last-child { font-weight: bold; }
    .footer { margin-top: 20px; text-align: center; font-size: 11px; border-top: 1px solid #ccc; padding-top: 8px; font-weight: bold; }
    .signature { margin-top: 40px; }
  </style>
</head>
<body>
  <p class="title">Pre Repossession Intimation to Police Station</p>
  <hr class="divider">
  <p class="date">Date :- ${p.date}</p>
  <div class="to-block">
    <p>To,</p>
    <p>The Senior Inspector,</p>
    <p><strong>${p.police_station},</strong></p>
    <p>TQ. ${p.tq}&nbsp;&nbsp;&nbsp;Dist. Nanded</p>
  </div>
  <div class="subject">
    <p><strong>Sub :</strong> Pre intimation of repossession of the vehicle from <strong>${p.customer_name}</strong></p>
    <p>(Borrower) residing <strong>${p.address}</strong></p>
  </div>
  <p class="body-text"><strong>Respected Sir,</strong></p>
  <p class="body-text">The afore mentioned borrower has taken a loan from Hero Fin-Corp Limited ("Company") for the purchase of the Vehicle having the below mentioned details and further the Borrower hypothecated the said vehicle to the Company in terms of loan-cum-hypothecation agreement executed between the borrower and the Company.</p>
  <table class="details-table">
    <tr><td>Name of the Borrower</td><td>${p.customer_name}</td></tr>
    <tr><td>Address of Borrower</td><td>${p.address}</td></tr>
    <tr><td>App ID</td><td>${p.app_id}</td></tr>
    <tr><td>Loan cum Hypothecation Agreement No.</td><td>${p.loan_no}</td></tr>
    <tr><td>Date</td><td>${p.date}</td></tr>
    <tr><td>Vehicle Registration No.</td><td>${p.registration_no}</td></tr>
    <tr><td>Model Make</td><td>${p.asset_make}</td></tr>
    <tr><td>Engine No.</td><td>${p.engine_no}</td></tr>
    <tr><td>Chassis No.</td><td>${p.chassis_no}</td></tr>
  </table>
  <p class="body-text">The Borrower has committed default on the scheduled payment of the Monthly Payments and/or other charges payable on the loan obtained by the Borrower from the Company in terms of the provisions of the aforesaid loan-cum-hypothecation agreement. In spite of Company's requests and reminders, the Borrower has not remitted the outstanding dues; as a result of which the company was left with no option but to enforce the terms and conditions of the said agreement. Under the said agreement, the said Borrower has specifically authorized Company or any of its authorized persons to take charge/repossession of the vehicle, in the event he fails to pay the loan amount when due to the Company. Pursuant to our right therein we are taking steps to recover possession of the said vehicle. This communication is for your record and to prevent confusion that may arise from any complaint that the borrower may lodge with respect to the aforesaid vehicle.</p>
  <p class="body-text">Thanking you,</p>
  <p class="body-text">Yours Sincerely,</p>
  <div class="signature"><p><strong>For, Hero Fin-Corp Limited</strong></p></div>
  <div class="footer">Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India</div>
</body>
</html>`;
}
 
function buildPostIntimationHtml(p: ReturnType<typeof buildIntimationParams>): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; padding: 40px 50px; line-height: 1.6; }
    .title { text-align: center; font-size: 16px; font-weight: bold; text-decoration: underline; margin-bottom: 6px; }
    .divider { border: none; border-top: 1px solid #ccc; margin: 10px 0; }
    .date { font-weight: bold; margin-bottom: 16px; }
    .to-block { margin-left: 24px; margin-bottom: 14px; }
    .to-block p { margin-bottom: 2px; }
    .subject { margin-bottom: 14px; }
    .body-text { margin-bottom: 10px; text-align: justify; }
    .details-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    .details-table tr:nth-child(even) { background-color: #f8f8f8; }
    .details-table td { padding: 6px 10px; border: 1px solid #ddd; }
    .details-table td:first-child { width: 45%; color: #333; }
    .details-table td:last-child { font-weight: bold; }
    .footer { margin-top: 20px; text-align: center; font-size: 11px; border-top: 1px solid #ccc; padding-top: 8px; font-weight: bold; }
    .signature { margin-top: 40px; }
  </style>
</head>
<body>
  <p class="title">Post Repossession Intimation to Police Station</p>
  <hr class="divider">
  <p class="date">Date: ${p.date}</p>
  <div class="to-block">
    <p>To,</p>
    <p>The Senior Inspector,</p>
    <p><strong>${p.police_station},</strong></p>
    <p>TQ. ${p.tq}&nbsp;&nbsp;&nbsp;Dist. Nanded</p>
  </div>
  <div class="subject">
    <p><strong>Sub :</strong> Intimation after repossession of the vehicle No <strong>${p.registration_no}</strong> From Mr. <strong>${p.customer_name}</strong></p>
    <p>(Borrower) residing <strong>${p.address}</strong></p>
  </div>
  <p class="body-text"><strong>Respected Sir,</strong></p>
  <p class="body-text">This is in furtherance to our letter dated bearing reference number <strong>${p.reference_no}</strong> whereby it was intimated to you that despite our repeated requests, reminders and personal visits the above said borrower has defaulted in repaying the above TW Loan as expressly agreed by him/her under the Loan (cum Hypothecation) Agreement and guarantee entered between the said borrower and the company.</p>
  <p class="body-text">Pursuant to our right under the said Agreement we have taken peaceful repossession of the said vehicle.</p>
  <p class="body-text">We have taken peaceful repossession of the said vehicle on <strong>${p.repossession_date}</strong> at from <strong>${p.repossession_address}</strong></p>
  <p class="body-text"><strong>DETAILS OF THE VEHICLE REPOSSESSED:-</strong></p>
  <table class="details-table">
    <tr><td>Name of the Borrower</td><td>${p.customer_name}</td></tr>
    <tr><td>Address of Borrower</td><td>${p.address}</td></tr>
    <tr><td>Loan Agreement No.</td><td>${p.loan_no}</td></tr>
    <tr><td>App ID</td><td>${p.app_id}</td></tr>
    <tr><td>Vehicle Registration Number</td><td>${p.registration_no}</td></tr>
    <tr><td>Model Make</td><td>${p.asset_make}</td></tr>
    <tr><td>Engine No.</td><td>${p.engine_no}</td></tr>
    <tr><td>Chassis No.</td><td>${p.chassis_no}</td></tr>
  </table>
  <p class="body-text">This communication is for your records and to prevent any confusion that may arise for any complaint that the Borrower may lodge with respect to the said vehicle.</p>
  <p class="body-text">Thanking You,</p>
  <p class="body-text">Yours Sincerely,</p>
  <div class="signature"><p><strong>For, Hero Fin Corp Limited</strong></p></div>
  <div class="footer">Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India</div>
</body>
</html>`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  await storage.initBktPerfSummaryTable();

  try {
    await storage.query(`ALTER TABLE required_deposits ADD COLUMN IF NOT EXISTS cash_collected BOOLEAN DEFAULT FALSE, ADD COLUMN IF NOT EXISTS cash_collected_at TIMESTAMP`);
    console.log("[DB] cash_collected columns ready ✅");
  } catch (e: any) { console.error("[DB] Migration error:", e.message); }

  try {
    await storage.query(`ALTER TABLE fos_agents ADD COLUMN IF NOT EXISTS phone TEXT`);
    console.log("[DB] fos_agents.phone column ready ✅");
  } catch (e: any) { console.error("[DB] fos_agents.phone migration:", e.message); }

  // ── ADD THIS: migrate company_name column onto loan_cases ─────────────────
  try {
    await storage.query(`ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS company_name TEXT`);
    console.log("[DB] loan_cases.company_name column ready ✅");
  } catch (e: any) { console.error("[DB] loan_cases.company_name migration:", e.message); }

  try {
    await storage.query(`CREATE TABLE IF NOT EXISTS fos_depositions (
      id SERIAL PRIMARY KEY, agent_id INTEGER REFERENCES fos_agents(id),
      loan_no TEXT, customer_name TEXT, bkt TEXT, source TEXT DEFAULT 'loan',
      amount NUMERIC(12,2) NOT NULL DEFAULT 0, cash_amount NUMERIC(12,2) DEFAULT 0,
      online_amount NUMERIC(12,2) DEFAULT 0, payment_method TEXT DEFAULT 'pending',
      screenshot_url TEXT, notes TEXT, deposition_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log("[DB] fos_depositions table ready ✅");
  } catch (e: any) { console.error("[DB] fos_depositions error:", e.message); }

  try {
    const salaryDetailAlters = [
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS present_days INTEGER DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS payment_amount NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS incentive_amount NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS petrol_expense NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS mobile_expense NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS gross_payment NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS advance NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS other_deductions NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0`,
      `ALTER TABLE salary_details ADD COLUMN IF NOT EXISTS net_salary NUMERIC DEFAULT 0`,
    ];
    for (const sql of salaryDetailAlters) { try { await storage.query(sql); } catch {} }
    console.log("[DB] salary_details columns ready ✅");
  } catch (e: any) { console.error("[DB] salary_details migration:", e.message); }

  try {
    await storage.query(`CREATE TABLE IF NOT EXISTS call_recordings (
      id SERIAL PRIMARY KEY, agent_id INTEGER REFERENCES fos_agents(id),
      case_id INTEGER, loan_no TEXT, recording_sid TEXT UNIQUE, call_sid TEXT,
      drive_file_id TEXT, drive_link TEXT, duration_seconds INTEGER DEFAULT 0,
      recorded_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log("[DB] call_recordings table ready ✅");
  } catch (e: any) { console.error("[DB] call_recordings error:", e.message); }

  try {
  await storage.query(`ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS extra_numbers TEXT[] DEFAULT '{}'`);
  await storage.query(`ALTER TABLE bkt_cases ADD COLUMN IF NOT EXISTS extra_numbers TEXT[] DEFAULT '{}'`);
  console.log("[DB] extra_numbers columns ready ✅");
} catch (e: any) { console.error("[DB] extra_numbers migration:", e.message); }

app.use("/api/fos-depositions", (req, res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }
  express.json()(req, res, next);
});

  app.use("/api/cases", (req, res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next(); // skip json parser, let multer handle it
  }
  next();
});
  const PgStore = connectPgSimple(session);
  app.use(session({
    store: new PgStore({ conString: process.env.DATABASE_URL, tableName: "user_sessions", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "fos-secret-key-2024",
    resave: false, saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 },
  }));

  function requireAuth(req: Request, res: Response, next: any) {
    if (req.session.agentId) return next();
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload) { req.session.agentId = payload.agentId; req.session.role = payload.role; return next(); }
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  function requireAdmin(req: Request, res: Response, next: any) {
    if (req.session.agentId && req.session.role === "admin") return next();
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload?.role === "admin") { req.session.agentId = payload.agentId; req.session.role = payload.role; return next(); }
    }
    return res.status(403).json({ message: "Forbidden" });
  }

  function requireRepo(req: Request, res: Response, next: any) {
    if (req.session.agentId && req.session.role === "repo") return next();
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload?.role === "repo") { req.session.agentId = payload.agentId; req.session.role = payload.role; return next(); }
    }
    return res.status(403).json({ message: "Forbidden" });
  }

  app.get("/api/repo/cases", requireRepo, async (req, res) => {
    try { res.json({ cases: await storage.getAllLoanCases() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const agent = await storage.getAgentByUsername(username);
      if (!agent || agent.password !== password) return res.status(401).json({ message: "Invalid credentials" });
      req.session.agentId = agent.id; req.session.role = agent.role;
      const { password: _, ...safeAgent } = agent;
      const token = signToken({ agentId: agent.id, role: agent.role });
      res.json({ agent: safeAgent, token });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/auth/logout", (req, res) => { req.session.destroy(() => res.json({ success: true })); });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getAgentById(req.session.agentId!);
      if (!agent) return res.status(404).json({ message: "Not found" });
      const { password: _, ...safeAgent } = agent;
      const token = signToken({ agentId: agent.id, role: agent.role });
      res.json({ agent: safeAgent, token });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/auth/refresh", requireAuth, async (req, res) => {
   try {
     const agent = await storage.getAgentById(req.session.agentId!);
     if (!agent) return res.status(404).json({ message: "Not found" });
     const { password: _, ...safeAgent } = agent;
     const token = signToken({ agentId: agent.id, role: agent.role });
     res.json({ agent: safeAgent, token });
   } catch (e: any) { res.status(500).json({ message: e.message }); }
 });

  app.get("/api/cases", requireAuth, async (req, res) => {
    try { res.json({ cases: await storage.getLoanCasesByAgent(req.session.agentId!) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
    try {
      const c = await storage.getLoanCaseById(Number(req.params.id));
      if (!c) return res.status(404).json({ message: "Not found" });
      res.json({ case: c });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/cases/:id/feedback", requireAuth, async (req, res) => {
    try {
      const { status, feedback, comments, ptp_date, rollback_yn, customer_available, vehicle_available, third_party, third_party_name, third_party_number, feedback_code, projection, non_starter, kyc_purchase, workable, monthly_feedback } = req.body;
      const ynVal = rollback_yn === true || rollback_yn === "true" ? true : rollback_yn === false || rollback_yn === "false" ? false : null;
      const toBool = (v: any) => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
      const caseId = Number(req.params.id);
      const oldRow = await storage.query(`SELECT status, rollback_yn, pos::numeric AS pos, agent_id, bkt, pro FROM loan_cases WHERE id = $1`, [caseId]);
      const old = oldRow.rows[0];
      const extraFields = {
        ...(customer_available !== undefined && { customerAvailable: toBool(customer_available) }),
        ...(vehicle_available !== undefined && { vehicleAvailable: toBool(vehicle_available) }),
        ...(third_party !== undefined && { thirdParty: toBool(third_party) }),
        ...(third_party_name !== undefined && { thirdPartyName: third_party_name || null }),
        ...(third_party_number !== undefined && { thirdPartyNumber: third_party_number || null }),
        ...(feedback_code !== undefined && { feedbackCode: feedback_code || null }),
        ...(projection !== undefined && { projection: projection || null }),
        ...(non_starter !== undefined && { nonStarter: toBool(non_starter) }),
        ...(kyc_purchase !== undefined && { kycPurchase: toBool(kyc_purchase) }),
        ...(workable !== undefined && { workable: toBool(workable) }),
        monthlyFeedback: monthly_feedback || null,
      };
      await storage.updateLoanCaseFeedback(caseId, status, feedback, comments, ptp_date, ynVal, extraFields);
      if (old && old.bkt && old.agent_id && !["UC","RUC"].includes((old.pro || "").toUpperCase())) {
        const pos = parseFloat(old.pos) || 0;
        const bktKey = `bkt${old.bkt}`;
        const wasPaid = old.status === "Paid"; const nowPaid = status === "Paid";
        const wasRb = old.rollback_yn === true; const nowRb = ynVal === true;
        const dPos = !wasPaid && nowPaid ? pos : wasPaid && !nowPaid ? -pos : 0;
        const dCount = !wasPaid && nowPaid ? 1 : wasPaid && !nowPaid ? -1 : 0;
        const dRb = !wasRb && nowRb ? pos : wasRb && !nowRb ? -pos : 0;
        await storage.applyBktPerfDelta(old.agent_id, bktKey, dPos, -dPos, dCount, -dCount, dRb, -dRb);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/stats", requireAuth, async (req, res) => {
    try { res.json(await storage.getAgentStats(req.session.agentId!)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

app.get("/api/today-ptp", requireAuth, async (req, res) => {
  try {
    const agentId = req.session.agentId!;
    const result = await storage.query(`
      SELECT 'loan' AS source, id, customer_name, loan_no, pos::numeric AS pos, ptp_date, telecaller_ptp_date
      FROM loan_cases WHERE agent_id=$1
        AND (
          (status = 'PTP' AND ptp_date = CURRENT_DATE)
          OR (status = 'PTP' AND telecaller_ptp_date = CURRENT_DATE)
        )
      UNION ALL
      SELECT 'bkt' AS source, id, customer_name, loan_no, pos::numeric AS pos, ptp_date, telecaller_ptp_date
      FROM bkt_cases WHERE agent_id=$1
        AND (
          (status = 'PTP' AND ptp_date = CURRENT_DATE)
          OR (status = 'PTP' AND telecaller_ptp_date = CURRENT_DATE)
        )
      ORDER BY customer_name
    `, [agentId]);
    res.json({ count: result.rows.length, cases: result.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  app.get("/api/attendance/today", requireAuth, async (req, res) => {
    try { res.json({ attendance: await storage.getTodayAttendance(req.session.agentId!) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/attendance/checkin", requireAuth, async (req, res) => {
    try { await storage.checkIn(req.session.agentId!); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/attendance/checkout", requireAuth, async (req, res) => {
    try { await storage.checkOut(req.session.agentId!); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/salary", requireAuth, async (req, res) => {
    try { res.json({ salary: await storage.getSalaryDetails(req.session.agentId!) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/depositions", requireAuth, async (req, res) => {
    try { res.json({ depositions: await storage.getDepositions(req.session.agentId!) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/depositions", requireAuth, async (req, res) => {
    try { await storage.createDeposition({ agentId: req.session.agentId!, ...req.body }); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const agent = await storage.getAgentById(req.session.agentId!);
      if (!agent || agent.password !== currentPassword) return res.status(400).json({ message: "Current password is incorrect" });
      await storage.updateAgentPassword(req.session.agentId!, newPassword);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/agents", requireAdmin, async (req, res) => {
    try { res.json({ agents: await storage.getAllAgents() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try { res.json({ stats: await storage.getAllAgentStats() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/cases", requireAdmin, async (req, res) => {
    try { res.json({ cases: await storage.getAllLoanCases() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/cases/agent/:agentId", requireAdmin, async (req, res) => {
  try {
    const agentId = Number(req.params.agentId);
    const result = await storage.query(
      `SELECT
        lc.id, lc.loan_no, lc.app_id, lc.customer_name, lc.status,
        lc.pos::numeric AS pos, lc.bkt::text AS bkt,
        lc.mobile_no, lc.address, lc.reference_address,
        lc.latest_feedback, lc.feedback_code, lc.feedback_comments,
        lc.feedback_date, lc.monthly_feedback,
        lc.customer_available, lc.vehicle_available,
        lc.third_party, lc.third_party_name, lc.third_party_number,
        lc.projection, lc.non_starter, lc.kyc_purchase, lc.workable,
        lc.ptp_date, lc.telecaller_ptp_date, lc.rollback_yn,
        lc.agent_id, lc.registration_no, lc.pro,
        lc.emi_amount, lc.emi_due, lc.cbc, lc.lpp, lc.cbc_lpp,
        lc.rollback, lc.clearance,
        lc.asset_name, lc.asset_make, lc.engine_no, lc.chassis_no,
        lc.tenor, lc.first_emi_due_date, lc.loan_maturity_date,
        lc.ref1_name, lc.ref1_mobile, lc.ref2_name, lc.ref2_mobile,
        lc.extra_numbers,
        lc.company_name,
        fa.name AS agent_name,
        'loan' AS case_type
       FROM loan_cases lc
       LEFT JOIN fos_agents fa ON fa.id = lc.agent_id
       WHERE lc.agent_id = $1
       ORDER BY lc.customer_name`,
      [agentId]
    );
    res.json({ cases: result.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  app.get("/api/admin/salary", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(
        `SELECT sd.*, fa.name AS agent_name FROM salary_details sd LEFT JOIN fos_agents fa ON fa.id = sd.agent_id ORDER BY sd.year DESC, sd.month DESC, fa.name`
      );
      res.json({ salary: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

 app.post("/api/admin/salary", requireAdmin, async (req, res) => {
    try {
      const { agentId, month, year, presentDays, paymentAmount, incentiveAmount, petrolExpense, mobileExpense, grossPayment, advance, otherDeductions, netSalary } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId is required" });
      const gross = parseFloat(grossPayment ?? 0);
      const adv   = parseFloat(advance ?? 0);
      const other = parseFloat(otherDeductions ?? 0);
      const net   = parseFloat(netSalary ?? (gross - adv - other).toString());
      const total = gross - adv - other;
      const monthNum = monthToNumber(month);
      await storage.query(
        `INSERT INTO salary_details (agent_id, month, year, present_days, payment_amount, incentive_amount, petrol_expense, mobile_expense, gross_payment, advance, other_deductions, total, net_salary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [agentId, monthNum, year ?? new Date().getFullYear(), presentDays ?? 0, paymentAmount ?? 0, incentiveAmount ?? 0, petrolExpense ?? 0, mobileExpense ?? 0, gross, adv, other, total, net]
      );

      try {
        const agentRow = await storage.query(
          "SELECT id, name, push_token FROM fos_agents WHERE id = $1",
          [Number(agentId)]
        );
        const agent = agentRow.rows[0];
        const monthName = typeof month === "string" ? month : (MONTH_NAMES[monthNum - 1] ?? String(month));
        const yearVal   = year ?? new Date().getFullYear();
        const netStr    = net.toLocaleString("en-IN", { maximumFractionDigits: 0 });

        console.log(`[salary] agent=${agent?.name} token=${agent?.push_token?.slice(0, 20) ?? "NONE"}`);

        if (agent?.push_token?.trim()) {
          const pushResult = await sendPush(
            agent.push_token.trim(),
            "💰 Salary Credited",
            `Your salary of ₹${netStr} for ${monthName} ${yearVal} has been processed. Open app to view details.`,
            { screen: "salary", type: "salary_credited" }
          );
          console.log("[salary] push result:", JSON.stringify(pushResult));
        } else {
          console.warn(`[salary] ⚠️  No push token for agentId=${agentId}`);
        }
      } catch (pushErr: any) {
        console.error("[salary] Push notification failed:", pushErr.message);
      }

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/salary/:id", requireAdmin, async (req, res) => {
    try {
      await storage.query(`DELETE FROM salary_details WHERE id = $1`, [Number(req.params.id)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/depositions", requireAdmin, async (req, res) => {
    try { res.json({ depositions: await storage.getAllDepositions() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/attendance", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`SELECT a.*, fa.name AS agent_name FROM attendance a LEFT JOIN fos_agents fa ON fa.id = a.agent_id ORDER BY a.check_in DESC NULLS LAST, fa.name`);
      res.json({ attendance: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/required-deposits", requireAdmin, async (req, res) => {
    try { res.json({ deposits: await storage.getAllRequiredDeposits() }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/required-deposits", requireAdmin, async (req, res) => {
    try {
      const { agentId, amount, description, dueDate } = req.body;
      if (!agentId || !amount) return res.status(400).json({ message: "agentId and amount are required" });
      const deposit = await storage.createRequiredDeposit({ agentId: Number(agentId), amount: Number(amount), description, dueDate });
      const agentRow = await storage.query("SELECT id, name, push_token FROM fos_agents WHERE id = $1", [Number(agentId)]);
      const agent = agentRow.rows[0];
      console.log(`[deposit-assign] agent=${agent?.name} token=${agent?.push_token?.slice(0, 20) ?? "NONE"}`);
      if (agent?.push_token?.trim()) {
        const pushResult = await sendPush(
          agent.push_token.trim(),
          "💰 Deposit Assigned",
          `Admin assigned you a deposit of ₹${Number(amount).toLocaleString("en-IN")}. Upload screenshot within 2 hours.`,
          { screen: "deposition" }
        );
        console.log("[deposit-assign] push result:", JSON.stringify(pushResult));
      } else {
        console.warn(`[deposit-assign] ⚠️  No push token for agentId=${agentId}`);
      }
      res.json({ deposit });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/required-deposits/:id", requireAdmin, async (req, res) => {
    try { await storage.deleteRequiredDeposit(Number(req.params.id)); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put("/api/admin/required-deposits/:id/cash-collected", requireAdmin, async (req, res) => {
    try {
      const depositId = Number(req.params.id);
      await storage.query(`UPDATE required_deposits SET cash_collected=TRUE, cash_collected_at=NOW() WHERE id=$1`, [depositId]);
      const depositRow = await storage.query(`SELECT rd.agent_id, rd.amount, fa.push_token FROM required_deposits rd JOIN fos_agents fa ON fa.id=rd.agent_id WHERE rd.id=$1`, [depositId]);
      const deposit = depositRow.rows[0];
      if (deposit?.push_token) await sendPush(deposit.push_token, "✅ Cash Collection Verified", `Admin verified cash collection of ₹${parseFloat(deposit.amount).toLocaleString("en-IN")}.`, { type: "cash_collected" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/required-deposits", requireAuth, async (req, res) => {
    try { res.json({ deposits: await storage.getRequiredDeposits(req.session.agentId!) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

app.get("/api/admin/fos-depositions", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`SELECT fd.*, fa.name AS agent_name, fa.id AS fos_id FROM fos_depositions fd LEFT JOIN fos_agents fa ON fa.id=fd.agent_id WHERE DATE_TRUNC('month', fd.deposition_date) = DATE_TRUNC('month', CURRENT_DATE) ORDER BY fd.deposition_date DESC, fa.name, fd.created_at DESC`);
      const grouped: Record<string, any> = {};
      for (const row of result.rows) {
        const key = String(row.fos_id || row.agent_name || "unknown");
        if (!grouped[key]) grouped[key] = { agentId: row.fos_id, agentName: row.agent_name, depositions: [], totalCash: 0, totalOnline: 0, totalAmount: 0 };
        grouped[key].depositions.push(row);
        grouped[key].totalCash += parseFloat(row.cash_amount || 0);
        grouped[key].totalOnline += parseFloat(row.online_amount || 0);
        grouped[key].totalAmount += parseFloat(row.amount || 0);
      }
      res.json({ depositions: result.rows, grouped: Object.values(grouped) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/fos-depositions/:agentId", requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.agentId);
      const result = await storage.query(`SELECT fd.*, fa.name AS agent_name FROM fos_depositions fd LEFT JOIN fos_agents fa ON fa.id=fd.agent_id WHERE fd.agent_id=$1 AND DATE_TRUNC('month', fd.deposition_date) = DATE_TRUNC('month', CURRENT_DATE) ORDER BY fd.deposition_date DESC, fd.created_at DESC`, [agentId]);
      res.json({ depositions: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/fos-depositions", requireAdmin, async (req, res) => {
    try {
      const { agentId, loanNo, customerName, bkt, source, amount, cashAmount, onlineAmount, paymentMethod, notes, depositionDate } = req.body;
      if (!agentId || !amount) return res.status(400).json({ message: "agentId and amount required" });
      const cashAmt = parseFloat(cashAmount || 0); const onlineAmt = parseFloat(onlineAmount || 0); const totalAmt = parseFloat(amount);
      let method = paymentMethod || "pending";
      if (!paymentMethod) { if (cashAmt > 0 && onlineAmt > 0) method = "both"; else if (cashAmt > 0) method = "cash"; else if (onlineAmt > 0) method = "online"; }
      const result = await storage.query(`INSERT INTO fos_depositions (agent_id,loan_no,customer_name,bkt,source,amount,cash_amount,online_amount,payment_method,notes,deposition_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [agentId, loanNo || null, customerName || null, bkt || null, source || "loan", totalAmt, cashAmt, onlineAmt, method, notes || null, depositionDate || new Date().toISOString().slice(0, 10)]);
      try {
        const agentRow = await storage.query("SELECT id, name, push_token FROM fos_agents WHERE id=$1", [agentId]);
        const agent = agentRow.rows[0];
        console.log(`[fos-dep-assign] agent=${agent?.name} token=${agent?.push_token?.slice(0, 20) ?? "NONE"}`);
        if (agent?.push_token?.trim()) {
          const pushResult = await sendPush(
            agent.push_token.trim(),
            "💰 New Deposition Assigned",
            `Admin assigned you ₹${totalAmt.toLocaleString("en-IN")}${customerName ? ` for ${customerName}` : ""}. Mark as paid.`,
            { screen: "fos-depositions" }
          );
          console.log("[fos-dep-assign] push result:", JSON.stringify(pushResult));
        } else {
          console.warn(`[fos-dep-assign] ⚠️  No push token for agentId=${agentId}`);
        }
      } catch (pushErr: any) { console.error("[fos-dep-assign] push error:", pushErr.message); }
      res.json({ deposition: result.rows[0] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put("/api/admin/fos-depositions/:id/payment", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id); const { paymentMethod, cashAmount, onlineAmount, screenshotUrl } = req.body;
      const cashAmt = parseFloat(cashAmount || 0); const onlineAmt = parseFloat(onlineAmount || 0); const totalAmt = cashAmt + onlineAmt;
      await storage.query(`UPDATE fos_depositions SET payment_method=$1,cash_amount=$2,online_amount=$3,amount=CASE WHEN $4>0 THEN $4 ELSE amount END,screenshot_url=COALESCE($5,screenshot_url),updated_at=NOW() WHERE id=$6`, [paymentMethod, cashAmt, onlineAmt, totalAmt, screenshotUrl || null, id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/admin/fos-depositions/:id", requireAdmin, async (req, res) => {
    try { await storage.query(`DELETE FROM fos_depositions WHERE id=$1`, [Number(req.params.id)]); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/fos-depositions", requireAuth, async (req, res) => {
    try {
const result = await storage.query(`SELECT * FROM fos_depositions WHERE agent_id=$1 AND DATE_TRUNC('month', deposition_date) = DATE_TRUNC('month', CURRENT_DATE) ORDER BY deposition_date DESC, created_at DESC`, [req.session.agentId!]);
      res.json({ depositions: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
 app.post("/api/fos-depositions/:id/pay-cash", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agentId = req.session.agentId!;
    const { cashAmount } = req.body;
    if (!cashAmount || isNaN(parseFloat(cashAmount))) return res.status(400).json({ message: "Valid cash amount required" });

    const cashAmt = parseFloat(cashAmount);
    const depRow  = await storage.query(
      `SELECT amount, cash_amount, online_amount FROM fos_depositions WHERE id=$1 AND agent_id=$2`,
      [id, agentId]
    );
    if (!depRow.rows[0]) return res.status(404).json({ message: "Deposition not found" });

    const totalAssigned  = parseFloat(depRow.rows[0].amount        || 0);
    const existingCash   = parseFloat(depRow.rows[0].cash_amount   || 0);
    const existingOnline = parseFloat(depRow.rows[0].online_amount || 0);

    const newCashTotal  = existingCash + cashAmt;
    const totalPaidNow  = newCashTotal + existingOnline;
    const fullyPaid     = Math.round(totalPaidNow) >= Math.round(totalAssigned);
    const paymentMethod = existingOnline > 0 ? "both" : "cash";
    const finalMethod   = fullyPaid ? paymentMethod : "pending";

    await storage.query(
      `UPDATE fos_depositions SET payment_method=$1, cash_amount=$2, updated_at=NOW() WHERE id=$3 AND agent_id=$4`,
      [finalMethod, newCashTotal, id, agentId]
    );

    try {
      const agentNameRow = await storage.query(`SELECT name FROM fos_agents WHERE id=$1`, [agentId]);
      const adminRows    = await storage.query(`SELECT push_token FROM fos_agents WHERE role='admin' AND push_token IS NOT NULL AND push_token<>''`);
      for (const admin of adminRows.rows) {
        await sendPush(
          admin.push_token,
          fullyPaid ? "💵 Cash Payment Complete" : "💵 Partial Cash Payment",
          `${agentNameRow.rows[0]?.name || "FOS"} paid ₹${cashAmt.toLocaleString("en-IN")} cash${fullyPaid ? "" : ` (₹${(totalAssigned - totalPaidNow).toLocaleString("en-IN")} still pending)`}.`,
          { type: "fos_dep_cash" }
        );
      }
    } catch {}

    res.json({ success: true, amountApplied: cashAmt, remaining: Math.max(0, totalAssigned - totalPaidNow) });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});
app.post("/api/fos-depositions/:id/pay-online", requireAuth, screenshotUpload.single("screenshot"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agentId = req.session.agentId!;

    if (!req.file) return res.status(400).json({ message: "No screenshot uploaded" });

    const requestedOnline = parseFloat(req.body.onlineAmount || "0");
    const filename = req.file.filename;
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
    const screenshotUrl = `${baseUrl}/uploads/screenshots/${filename}`;

    const depRow = await storage.query(
      `SELECT amount, cash_amount, online_amount FROM fos_depositions WHERE id=$1 AND agent_id=$2`,
      [id, agentId]
    );
    if (!depRow.rows[0]) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Deposition not found" });
    }

    const totalAssigned  = parseFloat(depRow.rows[0].amount        || 0);
    const existingCash   = parseFloat(depRow.rows[0].cash_amount   || 0);
    const existingOnline = parseFloat(depRow.rows[0].online_amount || 0);

    const newOnlineAmt  = requestedOnline > 0
      ? requestedOnline
      : Math.max(0, totalAssigned - existingCash - existingOnline);
    const totalOnlineNow = existingOnline + newOnlineAmt;
    const totalPaidNow   = existingCash + totalOnlineNow;
    const fullyPaid      = Math.round(totalPaidNow) >= Math.round(totalAssigned);

    const paymentMethod  = existingCash > 0 ? "both" : "online";
    const finalMethod    = fullyPaid ? paymentMethod : "pending";

    await storage.query(
      `UPDATE fos_depositions SET payment_method=$1, online_amount=$2, screenshot_url=$3, updated_at=NOW() WHERE id=$4 AND agent_id=$5`,
      [finalMethod, totalOnlineNow, screenshotUrl, id, agentId]
    );

    const adminRows = await storage.query(`SELECT push_token FROM fos_agents WHERE role='admin' AND push_token IS NOT NULL AND push_token<>''`);
    const agentRow  = await storage.query(`SELECT name FROM fos_agents WHERE id=$1`, [agentId]);
    for (const admin of adminRows.rows) {
      await sendPush(
        admin.push_token,
        fullyPaid ? "📸 Online Payment Complete" : "📸 Partial Online Payment",
        `${agentRow.rows[0]?.name || "FOS"} paid ₹${newOnlineAmt.toLocaleString("en-IN")} online${fullyPaid ? "" : ` (₹${(totalAssigned - totalPaidNow).toLocaleString("en-IN")} still pending)`}.`,
        { type: "fos_dep_screenshot" }
      );
    }

    res.json({ success: true, screenshotUrl, amountApplied: newOnlineAmt, remaining: Math.max(0, totalAssigned - totalPaidNow) });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});
app.put("/api/fos-depositions/:id/pay-both", requireAuth, screenshotUpload.single("screenshot"), async (req, res) => {
  try {
    const id = Number(req.params.id); 
    const agentId = req.session.agentId!;
    const { cashAmount, onlineAmount } = req.body;

    const cashAmt = parseFloat(cashAmount || "0") || 0;
    const onlineAmt = parseFloat(onlineAmount || "0") || 0;
    if (cashAmt <= 0) return res.status(400).json({ message: "Cash amount must be > 0" });
    if (onlineAmt <= 0) return res.status(400).json({ message: "Online amount must be > 0" });
    if (!req.file) return res.status(400).json({ message: "No screenshot uploaded" });

    const filename = req.file.filename;
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
    const screenshotUrl = `${baseUrl}/uploads/screenshots/${filename}`;

    await storage.query(
      `UPDATE fos_depositions SET payment_method='both', cash_amount=$1, online_amount=$2, amount=GREATEST(amount,$3), screenshot_url=$4, updated_at=NOW() WHERE id=$5 AND agent_id=$6`,
      [cashAmt, onlineAmt, cashAmt + onlineAmt, screenshotUrl, id, agentId]
    );

    try {
      const agentRow = await storage.query(`SELECT name FROM fos_agents WHERE id=$1`, [agentId]);
      const adminRows = await storage.query(`SELECT push_token FROM fos_agents WHERE role='admin' AND push_token IS NOT NULL AND push_token<>''`);
      for (const admin of adminRows.rows) {
        await sendPush(admin.push_token, "🔀 Split Payment", `${agentRow.rows[0]?.name || "FOS"} paid ₹${cashAmt.toLocaleString("en-IN")} cash + ₹${onlineAmt.toLocaleString("en-IN")} online.`, { type: "fos_dep_both" });
      }
    } catch {}

    res.json({ success: true, screenshotUrl });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  app.get("/api/admin/fos-depositions-export", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`SELECT TO_CHAR(fd.deposition_date,'DD-Mon-YYYY') AS "Date", COALESCE(fa.name,'Unknown') AS "FOS Name", COALESCE(fd.customer_name,'') AS "Customer Name", COALESCE(fd.loan_no,'') AS "Loan No", ROUND(fd.cash_amount::numeric,2) AS "Cash Amount", ROUND(fd.online_amount::numeric,2) AS "Online Amount", ROUND(fd.amount::numeric,2) AS "Total Amount", fd.payment_method AS "Payment Method", COALESCE(fd.notes,'') AS "Notes" FROM fos_depositions fd LEFT JOIN fos_agents fa ON fa.id=fd.agent_id ORDER BY fd.deposition_date DESC, fa.name, fd.created_at DESC`);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("FOS Depositions");
      ws.columns = [{ header: "Date", key: "Date", width: 16 }, { header: "FOS Name", key: "FOS Name", width: 22 }, { header: "Customer Name", key: "Customer Name", width: 28 }, { header: "Loan No", key: "Loan No", width: 18 }, { header: "Cash Amount", key: "Cash Amount", width: 16 }, { header: "Online Amount", key: "Online Amount", width: 16 }, { header: "Total Amount", key: "Total Amount", width: 16 }, { header: "Payment Method", key: "Payment Method", width: 16 }, { header: "Notes", key: "Notes", width: 24 }];
      ws.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.alignment = { vertical: "middle", horizontal: "center" }; });
      let totalCash = 0, totalOnline = 0, totalAmt = 0;
      result.rows.forEach((row: any) => { const c = parseFloat(row["Cash Amount"] || 0); const o = parseFloat(row["Online Amount"] || 0); const t = parseFloat(row["Total Amount"] || 0); totalCash += c; totalOnline += o; totalAmt += t; ws.addRow({ "Date": row["Date"] || "", "FOS Name": row["FOS Name"] || "", "Customer Name": row["Customer Name"] || "", "Loan No": row["Loan No"] || "", "Cash Amount": c, "Online Amount": o, "Total Amount": t, "Payment Method": (row["Payment Method"] || "pending").toUpperCase(), "Notes": row["Notes"] || "" }); });
      if (result.rows.length > 0) { const tr = ws.addRow({ "Date": "TOTAL", "FOS Name": "", "Customer Name": "", "Loan No": `${result.rows.length} records`, "Cash Amount": totalCash, "Online Amount": totalOnline, "Total Amount": totalAmt, "Payment Method": "", "Notes": "" }); tr.eachCell((cell) => { cell.font = { bold: true }; }); }
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader("Content-Disposition", `attachment; filename="FOS_Depositions_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/import-depositions", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0]; const rawRows = worksheetToRows(ws, true);
      if (rawRows.length === 0) return res.json({ imported: 0, skipped: 0, errors: [] });
      const COL_MAP: Record<string, string> = { agreementno: "loan_no", agreementnumber: "loan_no", agreement: "loan_no", agrmtno: "loan_no", agrno: "loan_no", loanno: "loan_no", loannumber: "loan_no", loan: "loan_no", custname: "customer_name", customername: "customer_name", cust: "customer_name", customer: "customer_name", name: "customer_name", amount: "amount", totalamount: "amount", total: "amount", amountdue: "amount", dueamount: "amount", fos: "fos_name", fosname: "fos_name", fosagent: "fos_name", agent: "fos_name", collector: "fos_name" };
      let headerIdx = -1; let colMap: Record<number, string> = {};
      for (let r = 0; r < Math.min(rawRows.length, 10); r++) { const row = rawRows[r]; const tempMap: Record<number, string> = {}; let matched = 0; for (let c = 0; c < row.length; c++) { const norm = normalizeHeader(String(row[c] || "")); if (COL_MAP[norm]) { tempMap[c] = COL_MAP[norm]; matched++; } } if (matched >= 2) { headerIdx = r; colMap = tempMap; break; } }
      if (headerIdx === -1) return res.status(400).json({ message: "Could not find header row." });
      const { rows: existingAgents } = await storage.query(`SELECT id, name FROM fos_agents WHERE name IS NOT NULL`);
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) { if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id; }
      function resolveAgentId(fosName: string): number | null {
        if (!fosName) return null; const lower = fosName.toLowerCase().trim();
        if (agentByName[lower]) return agentByName[lower];
        for (const [dbName, id] of Object.entries(agentByName)) { if (lower.includes(dbName) || dbName.includes(lower)) return id; }
        return null;
      }
      try { await storage.query(`DELETE FROM fos_depositions WHERE payment_method!='pending' AND deposition_date<CURRENT_DATE`); } catch {}
      let imported = 0, skipped = 0; const errors: string[] = [];
      const today = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < rawRows.slice(headerIdx + 1).length; i++) {
        const row = rawRows.slice(headerIdx + 1)[i]; const mapped: Record<string, any> = {};
        for (const [ci, field] of Object.entries(colMap)) { const val = row[Number(ci)]; mapped[field] = val !== undefined && val !== "" ? String(val).trim() : null; }
        if (!mapped.fos_name && !mapped.customer_name && !mapped.loan_no && !mapped.amount) { skipped++; continue; }
        if (!mapped.amount || parseFloat(mapped.amount) <= 0) { skipped++; continue; }
        const agentId = mapped.fos_name ? resolveAgentId(mapped.fos_name) : null;
        if (mapped.fos_name && !agentId) { errors.push(`Row ${i + headerIdx + 2}: FOS "${mapped.fos_name}" not found`); skipped++; continue; }
        try { await storage.query(`INSERT INTO fos_depositions (agent_id,loan_no,customer_name,amount,cash_amount,online_amount,payment_method,deposition_date) VALUES ($1,$2,$3,$4,0,0,'pending',$5)`, [agentId, mapped.loan_no || null, mapped.customer_name || null, parseFloat(mapped.amount || "0") || 0, today]); imported++; }
        catch (e: any) { errors.push(`Row ${i + headerIdx + 2}: ${e.message}`); skipped++; }
      }
      if (imported > 0) {
        try {
          const fosAgents = await storage.query(
            `SELECT id, name, push_token FROM fos_agents WHERE role='fos' AND push_token IS NOT NULL AND push_token != ''`
          );
          const playerIds = fosAgents.rows.map((r: any) => r.push_token?.trim()).filter(Boolean);
          console.log(`[import-dep] Notifying ${playerIds.length} FOS agents about ${imported} new records`);
          if (playerIds.length > 0) {
            const pushResult = await sendPushToMany(
              playerIds,
              "📋 New Deposits Assigned",
              `Admin uploaded ${imported} new deposit record${imported > 1 ? "s" : ""}. Open app to mark payments.`,
              { screen: "fos-depositions", type: "bulk_import" }
            );
            console.log("[import-dep] push result:", JSON.stringify(pushResult));
          } else {
            console.warn("[import-dep] ⚠️  No FOS agents have push tokens registered");
          }
        } catch (pushErr: any) {
          console.error("[import-dep] Push failed:", pushErr.message);
        }
      }
      res.json({ imported, skipped, total: rawRows.slice(headerIdx + 1).length, errors: errors.slice(0, 20) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/push-token", requireAuth, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string" || token.trim() === "") return res.status(400).json({ message: "token required" });
      await storage.query("UPDATE fos_agents SET push_token=$1 WHERE id=$2", [token.trim(), req.session.agentId!]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/push-status", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`SELECT id, name, CASE WHEN push_token IS NOT NULL AND push_token<>'' THEN true ELSE false END AS has_token, LEFT(push_token,40) AS token_preview FROM fos_agents WHERE role='fos' ORDER BY name`);
      res.json({ agents: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/test-push/:agentId", requireAdmin, async (req, res) => {
    try {
      const agentRow = await storage.query("SELECT id, name, push_token FROM fos_agents WHERE id=$1", [Number(req.params.agentId)]);
      const agent = agentRow.rows[0];
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (!agent.push_token) return res.status(400).json({ message: "No push token." });
      const result = await sendPush(agent.push_token, "🔔 Test Notification", `Hello ${agent.name}!`, { type: "test" });
      res.json({ success: result.ok, error: result.error ?? null, agentName: agent.name });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/admin/test-push-all", requireAdmin, async (req, res) => {
    try {
      const agents = await storage.query("SELECT push_token FROM fos_agents WHERE role='fos' AND push_token IS NOT NULL AND push_token<>''");
      if (agents.rows.length === 0) return res.json({ sent: 0, total: 0 });
      const result = await sendPushToMany(agents.rows.map((a: any) => a.push_token), "🔔 Test Notification", "Admin sent a test notification.", { type: "test" });
      res.json({ sent: result.sent, total: result.total });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/profile-photo", requireAuth, async (req, res) => {
    try { await storage.query("UPDATE fos_agents SET photo_url=$1 WHERE id=$2", [req.body.photoUrl, req.session.agentId!]); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/profile", requireAuth, async (req, res) => {
    try { const result = await storage.query("SELECT id,name,username,role,phone,photo_url FROM fos_agents WHERE id=$1", [req.session.agentId!]); res.json(result.rows[0] || {}); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/required-deposits/:id/screenshot", requireAuth, screenshotUpload.single("screenshot"), async (req, res) => {
    try {
      const depositId = Number(req.params.id);
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "";
      const screenshotUrl = `${baseUrl}/uploads/screenshots/${req.file.filename}`;
      await storage.query("UPDATE required_deposits SET screenshot_url=$1, screenshot_uploaded_at=NOW() WHERE id=$2 AND agent_id=$3", [screenshotUrl, depositId, req.session.agentId!]);
      const depositRow = await storage.query(`SELECT rd.amount, fa.name AS agent_name FROM required_deposits rd JOIN fos_agents fa ON fa.id=rd.agent_id WHERE rd.id=$1`, [depositId]);
      const deposit = depositRow.rows[0];
      const adminRows = await storage.query(`SELECT push_token FROM fos_agents WHERE role='admin' AND push_token IS NOT NULL AND push_token<>''`);
      if (adminRows.rows.length > 0) await sendPushToMany(adminRows.rows.map((r: any) => r.push_token), "📸 Screenshot Uploaded", `${deposit?.agent_name || "FOS"} uploaded ₹${parseFloat(deposit?.amount || 0).toLocaleString("en-IN")}.`, { type: "screenshot_uploaded", depositId });
      res.json({ success: true, screenshotUrl });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put("/api/admin/required-deposits/:id/verify", requireAdmin, async (req, res) => {
    try {
      await storage.query("UPDATE required_deposits SET alarm_scheduled=TRUE WHERE id=$1", [Number(req.params.id)]);
      const depositRow = await storage.query(`SELECT rd.agent_id, rd.amount, fa.push_token FROM required_deposits rd JOIN fos_agents fa ON fa.id=rd.agent_id WHERE rd.id=$1`, [Number(req.params.id)]);
      const deposit = depositRow.rows[0];
      if (deposit?.push_token) await sendPush(deposit.push_token, "✅ Deposit Verified", `Payment of ₹${parseFloat(deposit.amount).toLocaleString("en-IN")} verified.`, { type: "deposit_verified" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/cases", requireAdmin, async (req, res) => {
    try { await storage.createLoanCase(req.body); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/agent/:agentId/stats", requireAdmin, async (req, res) => {
    try { res.json(await storage.getAgentStats(Number(req.params.agentId))); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/admin/bkt-cases", requireAdmin, async (req, res) => {
    try { res.json({ cases: await storage.getAllBktCases(req.query.category as string | undefined) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/bkt-cases", requireAuth, async (req, res) => {
    try { res.json({ cases: await storage.getBktCasesByAgent(req.session.agentId!, req.query.category as string | undefined) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/bkt-cases/:id/feedback", requireAuth, async (req, res) => {
    try {
      const { status, feedback, comments, ptp_date, rollback_yn, customer_available, vehicle_available, third_party, third_party_name, third_party_number, feedback_code, projection, non_starter, kyc_purchase, workable, monthly_feedback } = req.body;
      const ynVal = rollback_yn === true || rollback_yn === "true" ? true : rollback_yn === false || rollback_yn === "false" ? false : null;
      const toBool = (v: any) => v === true || v === "true" ? true : v === false || v === "false" ? false : null;
      const caseId = Number(req.params.id);
      const oldRow = await storage.query(`SELECT status, rollback_yn, pos::numeric AS pos, agent_id, case_category, pro FROM bkt_cases WHERE id=$1`, [caseId]);
      const old = oldRow.rows[0];
      const bktExtraFields = {
        ...(customer_available !== undefined && { customerAvailable: toBool(customer_available) }),
        ...(vehicle_available !== undefined && { vehicleAvailable: toBool(vehicle_available) }),
        ...(third_party !== undefined && { thirdParty: toBool(third_party) }),
        ...(third_party_name !== undefined && { thirdPartyName: third_party_name || null }),
        ...(third_party_number !== undefined && { thirdPartyNumber: third_party_number || null }),
        ...(feedback_code !== undefined && { feedbackCode: feedback_code || null }),
        ...(projection !== undefined && { projection: projection || null }),
        ...(non_starter !== undefined && { nonStarter: toBool(non_starter) }),
        ...(kyc_purchase !== undefined && { kycPurchase: toBool(kyc_purchase) }),
        ...(workable !== undefined && { workable: toBool(workable) }),
        monthlyFeedback: monthly_feedback || null,
      };
      await storage.updateBktCaseFeedback(caseId, status, feedback, comments, ptp_date, ynVal, bktExtraFields);
      if (old && old.case_category && old.agent_id && !["UC","RUC"].includes((old.pro || "").toUpperCase())) {
        const pos = parseFloat(old.pos) || 0;
        const bktKey = (old.case_category as string).toLowerCase().replace(/\s+/g, "");
        const wasPaid = old.status === "Paid"; const nowPaid = status === "Paid";
        const wasRb = old.rollback_yn === true; const nowRb = ynVal === true;
        const dPos = !wasPaid && nowPaid ? pos : wasPaid && !nowPaid ? -pos : 0;
        const dCount = !wasPaid && nowPaid ? 1 : wasPaid && !nowPaid ? -1 : 0;
        const dRb = !wasRb && nowRb ? pos : wasRb && !nowRb ? -pos : 0;
        await storage.applyBktPerfDelta(old.agent_id, bktKey, dPos, -dPos, dCount, -dCount, dRb, -dRb);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORT ALLOCATION — now includes company_name
  // ─────────────────────────────────────────────────────────────────────────────
  app.post("/api/admin/import", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook1 = new ExcelJS.Workbook(); await ejWorkbook1.xlsx.load(req.file.buffer);
      const worksheet1 = ejWorkbook1.worksheets[0]; const rawRows: any[][] = worksheetToRows(worksheet1, true);
      if (rawRows.length === 0) return res.json({ imported: 0, updated: 0, skipped: 0, agentsCreated: 0, agentsRemoved: 0, errors: [] });
      let headerRowIdx = -1; let colIdxMap: Record<number, string> = {};
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) { const row = rawRows[r]; const tempMap: Record<number, string> = {}; let matched = 0; for (let c = 0; c < row.length; c++) { const norm = normalizeHeader(String(row[c] || "")); if (COLUMN_MAP[norm]) { tempMap[c] = COLUMN_MAP[norm]; matched++; } } if (matched >= 3) { headerRowIdx = r; colIdxMap = tempMap; break; } }
      if (headerRowIdx === -1) return res.status(400).json({ message: "Could not find header row." });
      const fosNamesInExcel = new Set<string>();
      for (const row of rawRows.slice(headerRowIdx + 1)) { const mapped: Record<string, any> = {}; for (const [colIdx, dbField] of Object.entries(colIdxMap)) { const val = row[Number(colIdx)]; mapped[dbField] = val !== undefined && val !== "" ? String(val).trim() : null; } if (mapped.fos_name && !isRepeatHeaderRow(mapped)) fosNamesInExcel.add(mapped.fos_name.toLowerCase().trim()); }
      const ptpLoanSave = await storage.query(`SELECT loan_no, ptp_date, telecaller_ptp_date FROM loan_cases WHERE status='PTP'`);
      const ptpLoanMap = new Map(ptpLoanSave.rows.map((r: any) => [r.loan_no, { ptpDate: r.ptp_date, telecallerPtpDate: r.telecaller_ptp_date }]));
     await storage.query(`UPDATE depositions SET loan_case_id=NULL WHERE loan_case_id IS NOT NULL`);

const savedExtras = await storage.query(
  `SELECT loan_no, extra_numbers FROM loan_cases 
  WHERE extra_numbers IS NOT NULL 
  AND array_length(extra_numbers, 1) > 0`
);
const extrasMap = new Map<string, string[]>();
for (const row of savedExtras.rows) {
  if (row.extra_numbers?.length) extrasMap.set(row.loan_no, row.extra_numbers);
}
console.log(`[import] 💾 Saved extra_numbers for ${extrasMap.size} loan(s) before wipe`);

// ── Save monthly_feedback before wipe ─────────────────────────
const savedMonthlyFb = await storage.query(`
  SELECT loan_no, monthly_feedback 
  FROM loan_cases 
  WHERE monthly_feedback IS NOT NULL AND monthly_feedback != ''
`);
const monthlyFeedbackMap = new Map<string, string>();
for (const row of savedMonthlyFb.rows) {
  if (row.monthly_feedback) monthlyFeedbackMap.set(row.loan_no, row.monthly_feedback);
}
console.log(`[import] 💾 Saved monthly_feedback for ${monthlyFeedbackMap.size} loan(s) before wipe`);

await storage.deleteAllLoanCases();

      const existingFosAgents = await storage.query(`SELECT id, name FROM fos_agents WHERE role='fos'`);
      let agentsRemoved = 0;
      for (const agent of existingFosAgents.rows) { if (!fosNamesInExcel.has((agent.name || "").toLowerCase().trim())) { await safeDeleteAgent(agent.id, "import"); agentsRemoved++; } }
      const { rows: existingAgents } = await storage.query(`SELECT id, name FROM fos_agents WHERE name IS NOT NULL`);
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) { if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id; }
      let imported = 0, skipped = 0, agentsCreated = 0; const errors: string[] = [];
      for (let i = 0; i < rawRows.slice(headerRowIdx + 1).length; i++) {
        const row = rawRows.slice(headerRowIdx + 1)[i]; const mapped: Record<string, any> = {};
        for (const [colIdx, dbField] of Object.entries(colIdxMap)) { const val = row[Number(colIdx)]; mapped[dbField] = val !== undefined && val !== "" ? String(val).trim() : null; }
        if (!mapped.loan_no || !mapped.customer_name || isRepeatHeaderRow(mapped)) { skipped++; continue; }
        let agentId: number | null = null;
        if (mapped.fos_name) {
          const fosLower = mapped.fos_name.toLowerCase().trim();
          if (agentByName[fosLower]) { agentId = agentByName[fosLower]; }
          else { try { const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, ""); const newAgent = await storage.createFosAgent({ name: mapped.fos_name, username, password: randomBytes(16).toString("hex") }); agentByName[fosLower] = newAgent.id; agentId = newAgent.id; agentsCreated++; } catch { const found = await storage.getAgentByUsername(mapped.fos_name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")); if (found) { agentByName[mapped.fos_name.toLowerCase().trim()] = found.id; agentId = found.id; } } }
        }
        try {
          // ── upsertLoanCase now receives company_name ────────────────────────
          await storage.upsertLoanCase({
            agentId,
            fosName: mapped.fos_name || null,
            loanNo: mapped.loan_no,
            customerName: mapped.customer_name,
            bkt: mapped.bkt ? parseInt(mapped.bkt) || null : null,
            appId: mapped.app_id || null,
            address: mapped.address || null,
            mobileNo: mapped.mobile_no || null,
            referenceAddress: mapped.reference_address || null,
            pos: parseNum(mapped.pos),
            assetMake: mapped.asset_make || null,
            registrationNo: mapped.registration_no || null,
            engineNo: mapped.engine_no || null,
            chassisNo: mapped.chassis_no || null,
            emiAmount: parseNum(mapped.emi_amount),
            emiDue: parseNum(mapped.emi_due),
            cbc: parseNum(mapped.cbc),
            lpp: parseNum(mapped.lpp),
            cbcLpp: parseNum(mapped.cbc_lpp),
            rollback: parseNum(mapped.rollback),
            clearance: parseNum(mapped.clearance),
            firstEmiDueDate: parseDate(mapped.first_emi_due_date),
            loanMaturityDate: parseDate(mapped.loan_maturity_date),
            tenor: mapped.tenor ? parseInt(mapped.tenor) || null : null,
            pro: mapped.pro || null,
            status: normalizeStatus(mapped.status),
            latestFeedback: mapped.latest_feedback || null,
            feedbackComments: mapped.feedback_comments || null,
            telecallerPtpDate: parseDate(mapped.telecaller_ptp_date),
            rollbackYn: parseRollbackYn(mapped.rollback),
            companyName: mapped.company_name || null,  // ← NEW
          });
          imported++;
        } catch (e: any) { errors.push(`Row ${i + headerRowIdx + 2}: ${e.message}`); skipped++; }
      }

if (extrasMap.size > 0) {
  for (const [loanNo, numbers] of extrasMap) {
    await storage.query(
      `UPDATE loan_cases SET extra_numbers = $1::text[] WHERE loan_no = $2`,
      [numbers, loanNo]
    );
  }
  console.log(`[import] ✅ Restored extra_numbers for ${extrasMap.size} loan(s)`);
}

// ── Restore monthly_feedback ───────────────────────────────────
if (monthlyFeedbackMap.size > 0) {
  for (const [loanNo, feedback] of monthlyFeedbackMap) {
    await storage.query(
      `UPDATE loan_cases SET monthly_feedback = $1 WHERE loan_no = $2`,
      [feedback, loanNo]
    );
  }
  console.log(`[import] ✅ Restored monthly_feedback for ${monthlyFeedbackMap.size} loan(s)`);
}

for (const [loanNo, ptpData] of ptpLoanMap) {
  await storage.query(
    `UPDATE loan_cases SET status='PTP', ptp_date=$1, telecaller_ptp_date=$2 WHERE loan_no=$3`,
    [ptpData.ptpDate, ptpData.telecallerPtpDate, loanNo]
  );
}
try { await recalcBktPerfFromAllocation(); } catch (e: any) { console.warn("[import] BKT recalc warning:", e.message); }
res.json({ imported, updated: 0, skipped, agentsCreated, agentsRemoved, total: rawRows.slice(headerRowIdx + 1).length, errors: errors.slice(0, 20) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
     

  app.post("/api/admin/import-bkt", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook2 = new ExcelJS.Workbook(); await ejWorkbook2.xlsx.load(req.file.buffer);
      const worksheet2 = ejWorkbook2.worksheets.find((ws) => ws.name.toUpperCase() === "ALLO") || ejWorkbook2.worksheets[0];
      const rawRows: any[][] = worksheetToRows(worksheet2, true);
      if (rawRows.length === 0) return res.json({ imported: 0, updated: 0, skipped: 0, agentsCreated: 0, agentsRemoved: 0, errors: [] });
      let headerRowIdx = -1; let colIdxMap: Record<number, string> = {};
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) { const row = rawRows[r]; const tempMap: Record<number, string> = {}; let matched = 0; for (let c = 0; c < row.length; c++) { const norm = normalizeHeader(String(row[c] || "")); if (COLUMN_MAP[norm]) { tempMap[c] = COLUMN_MAP[norm]; matched++; } } if (matched >= 3) { headerRowIdx = r; colIdxMap = tempMap; break; } }
      if (headerRowIdx === -1) return res.status(400).json({ message: "Could not find header row." });
      const fosNamesInBktExcel = new Set<string>();
      for (const row of rawRows.slice(headerRowIdx + 1)) { const mapped: Record<string, any> = {}; for (const [colIdx, dbField] of Object.entries(colIdxMap)) { const val = row[Number(colIdx)]; mapped[dbField] = val !== undefined && val !== "" ? String(val).trim() : null; } if (mapped.fos_name && !isRepeatHeaderRow(mapped)) fosNamesInBktExcel.add(mapped.fos_name.toLowerCase().trim()); }
      const ptpBktSave = await storage.query(`SELECT loan_no, ptp_date, telecaller_ptp_date FROM bkt_cases WHERE status='PTP'`);
      const ptpBktMap = new Map(ptpBktSave.rows.map((r: any) => [r.loan_no, { ptpDate: r.ptp_date, telecallerPtpDate: r.telecaller_ptp_date }]));
      await storage.deleteAllBktCases();
      const existingFosBktAgents = await storage.query(`SELECT id, name FROM fos_agents WHERE role='fos'`);
      let agentsRemoved = 0;
      for (const agent of existingFosBktAgents.rows) { if (!fosNamesInBktExcel.has((agent.name || "").toLowerCase().trim())) { await safeDeleteAgent(agent.id, "import-bkt"); agentsRemoved++; } }
      const { rows: existingAgents } = await storage.query(`SELECT id, name FROM fos_agents WHERE name IS NOT NULL`);
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) { if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id; }
      let imported = 0, skipped = 0, agentsCreated = 0; const errors: string[] = [];
      for (let i = 0; i < rawRows.slice(headerRowIdx + 1).length; i++) {
        const row = rawRows.slice(headerRowIdx + 1)[i]; const mapped: Record<string, any> = {};
        for (const [colIdx, dbField] of Object.entries(colIdxMap)) { const val = row[Number(colIdx)]; mapped[dbField] = val !== undefined && val !== "" ? String(val).trim() : null; }
        if (!mapped.loan_no || !mapped.customer_name || isRepeatHeaderRow(mapped)) { skipped++; continue; }
        const bktVal = mapped.bkt ? parseInt(mapped.bkt) : null;
        let caseCategory = "penal";
        if (bktVal === 1) caseCategory = "bkt1"; else if (bktVal === 2) caseCategory = "bkt2"; else if (bktVal === 3) caseCategory = "bkt3";
        let agentId: number | null = null;
        if (mapped.fos_name) { const fosLower = mapped.fos_name.toLowerCase().trim(); if (agentByName[fosLower]) { agentId = agentByName[fosLower]; } else { try { const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, ""); const newAgent = await storage.createFosAgent({ name: mapped.fos_name, username, password: randomBytes(16).toString("hex") }); agentByName[fosLower] = newAgent.id; agentId = newAgent.id; agentsCreated++; } catch { const found = await storage.getAgentByUsername(mapped.fos_name.toLowerCase().trim().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")); if (found) { agentByName[mapped.fos_name.toLowerCase().trim()] = found.id; agentId = found.id; } } } }
        try { await storage.upsertBktCase({ caseCategory, agentId, fosName: mapped.fos_name || null, loanNo: mapped.loan_no, customerName: mapped.customer_name, bkt: bktVal, appId: mapped.app_id || null, address: mapped.address || null, mobileNo: mapped.mobile_no || null, ref1Name: mapped.ref1_name || null, ref1Mobile: mapped.ref1_mobile || null, ref2Name: mapped.ref2_name || null, ref2Mobile: mapped.ref2_mobile || null, referenceAddress: mapped.reference_address || null, pos: parseNum(mapped.pos), assetName: mapped.asset_name || null, assetMake: mapped.asset_make || null, registrationNo: mapped.registration_no || null, engineNo: mapped.engine_no || null, chassisNo: mapped.chassis_no || null, emiAmount: parseNum(mapped.emi_amount), emiDue: parseNum(mapped.emi_due), cbc: parseNum(mapped.cbc), lpp: parseNum(mapped.lpp), cbcLpp: parseNum(mapped.cbc_lpp), rollback: parseNum(mapped.rollback), clearance: parseNum(mapped.clearance), firstEmiDueDate: parseDate(mapped.first_emi_due_date), loanMaturityDate: parseDate(mapped.loan_maturity_date), tenor: mapped.tenor ? parseInt(mapped.tenor) || null : null, pro: mapped.pro || null, status: normalizeStatus(mapped.status), telecallerPtpDate: parseDate(mapped.telecaller_ptp_date) }); imported++; }
        catch (e: any) { errors.push(`Row ${i + headerRowIdx + 2}: ${e.message}`); skipped++; }
      }
      for (const [loanNo, ptpData] of ptpBktMap) { await storage.query(`UPDATE bkt_cases SET status='PTP', ptp_date=$1, telecaller_ptp_date=$2 WHERE loan_no=$3`, [ptpData.ptpDate, ptpData.telecallerPtpDate, loanNo]); }
      res.json({ imported, updated: 0, skipped, agentsCreated, agentsRemoved, total: rawRows.slice(headerRowIdx + 1).length, errors: errors.slice(0, 20) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/ptp-export", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`SELECT fa.name AS fos_name, lc.customer_name, lc.loan_no, lc.mobile_no, lc.address, lc.ptp_date, lc.telecaller_ptp_date, lc.pos, lc.bkt::text AS bkt, lc.status FROM loan_cases lc LEFT JOIN fos_agents fa ON lc.agent_id=fa.id WHERE lc.status='PTP' OR lc.telecaller_ptp_date IS NOT NULL UNION ALL SELECT fa.name AS fos_name, bc.customer_name, bc.loan_no, bc.mobile_no, bc.address, bc.ptp_date, bc.telecaller_ptp_date, bc.pos, bc.case_category AS bkt, bc.status FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id=fa.id WHERE bc.status='PTP' OR bc.telecaller_ptp_date IS NOT NULL ORDER BY fos_name NULLS LAST, telecaller_ptp_date NULLS LAST`);
      const rows = result.rows.map((r: any) => ({ "FOS Name": r.fos_name || "", "Customer Name": r.customer_name || "", "Loan No": r.loan_no || "", "Mobile No": r.mobile_no || "", "Address": r.address || "", "Telecaller PTP Date": r.telecaller_ptp_date ? String(r.telecaller_ptp_date).slice(0, 10) : "", "FOS PTP Date": r.ptp_date ? String(r.ptp_date).slice(0, 10) : "", "POS": r.pos || "", "BKT": r.bkt || "", "Status": r.status || "" }));
      const exportWb = new ExcelJS.Workbook(); const exportWs = exportWb.addWorksheet("PTP Cases");
      const exportRows = rows.length ? rows : [{ "FOS Name": "No PTP cases found" }];
      exportWs.columns = Object.keys(exportRows[0]).map((key) => ({ header: key, key, width: 20 }));
      exportRows.forEach((row) => exportWs.addRow(row)); exportWs.getRow(1).font = { bold: true };
      const buf = await exportWb.xlsx.writeBuffer();
      res.setHeader("Content-Disposition", `attachment; filename="PTP_Report_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/feedback-export", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`
        SELECT TO_CHAR(COALESCE(lc.created_at,NOW()),'DD-Mon') AS allu_date, lc.loan_no, lc.app_id, lc.customer_name, lc.bkt::text AS bkt, lc.pro, 'NANDED'::text AS branch, lc.customer_available, lc.vehicle_available, lc.third_party, lc.third_party_name, lc.third_party_number, lc.feedback_code, lc.latest_feedback, lc.monthly_feedback, lc.ptp_date, lc.projection, lc.non_starter, lc.kyc_purchase, lc.workable, lc.status, lc.feedback_comments, fa.name AS fos_name
        FROM loan_cases lc LEFT JOIN fos_agents fa ON lc.agent_id=fa.id
        WHERE lc.latest_feedback IS NOT NULL OR lc.feedback_code IS NOT NULL OR lc.status IN ('Paid','PTP')
        UNION ALL
        SELECT TO_CHAR(COALESCE(bc.created_at,NOW()),'DD-Mon') AS allu_date, bc.loan_no, bc.app_id, bc.customer_name, bc.case_category AS bkt, bc.pro, 'NANDED'::text AS branch, bc.customer_available, bc.vehicle_available, bc.third_party, bc.third_party_name, bc.third_party_number, bc.feedback_code, bc.latest_feedback, bc.monthly_feedback, bc.ptp_date, bc.projection, bc.non_starter, bc.kyc_purchase, bc.workable, bc.status, bc.feedback_comments, fa.name AS fos_name
        FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id=fa.id
        WHERE bc.latest_feedback IS NOT NULL OR bc.feedback_code IS NOT NULL OR bc.status IN ('Paid','PTP')
        ORDER BY fos_name NULLS LAST, loan_no
      `);
      const yn = (v: any) => v === true || v === "true" || v === "t" || v === 1 ? "Y" : v === false || v === "false" || v === "f" || v === 0 ? "N" : "";
      const rows = result.rows.map((r: any) => ({
        "Allu Date": r.allu_date || "", "LOAN NO": r.loan_no || "", "APP ID": r.app_id || "", "CUSTOMERNAME": r.customer_name || "",
        "Bkt": r.bkt || "", "Pro": r.pro || "", "Branch": r.branch || "",
        "Customer Y/N": yn(r.customer_available), "Vehicle Y/N": yn(r.vehicle_available), "Third_party Y/N": yn(r.third_party),
        "Third Party Name": r.third_party === true || r.third_party === "true" || r.third_party === "t" ? r.third_party_name || "" : "",
        "Third Party Number": r.third_party === true || r.third_party === "true" || r.third_party === "t" ? r.third_party_number || "" : "",
        "FEEDBACK CODE": r.feedback_code != null ? String(r.feedback_code) : "",
        "Details FEEDBACK": r.latest_feedback != null ? String(r.latest_feedback) : "",
        "Monthly Feedback": r.monthly_feedback != null ? String(r.monthly_feedback) : "",
        "PTP DATE": r.ptp_date ? (r.ptp_date instanceof Date ? r.ptp_date.toISOString().slice(0, 10) : String(r.ptp_date).slice(0, 10)) : "",
        "Projection": r.projection != null ? String(r.projection) : "",
        "NON_STARTER (Y/N)": yn(r.non_starter), "KYC PURCHASE (Y/N)": yn(r.kyc_purchase),
        "Workable/Non": r.workable === true || r.workable === "true" || r.workable === "t" ? "WORKABLE" : r.workable === false || r.workable === "false" || r.workable === "f" ? "NONWORKABLE" : "",
        "Comments": r.feedback_comments || "", "Status": r.status || "", "FOS Name": r.fos_name || "",
      }));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Feedback Report");
      const exportRows = rows.length ? rows : [{}];
      ws.columns = Object.keys(exportRows[0]).map((key) => ({ header: key, key, width: ["CUSTOMERNAME", "Details FEEDBACK", "Monthly Feedback", "Comments"].includes(key) ? 30 : 16 }));
      exportRows.forEach((row) => ws.addRow(row));
      ws.getRow(1).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }; cell.font = { bold: true }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Object.keys(exportRows[0]).length } };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader("Content-Disposition", `attachment; filename="Feedback_Report_${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(Buffer.from(buf));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/clear-ptp", requireAdmin, async (req, res) => {
    try {
      await storage.query(`UPDATE loan_cases SET ptp_date=NULL, telecaller_ptp_date=NULL, status='Pending' WHERE status='PTP'`);
      await storage.query(`UPDATE bkt_cases SET ptp_date=NULL, telecaller_ptp_date=NULL, status='Pending' WHERE status='PTP'`);
      await storage.query(`UPDATE loan_cases SET ptp_date=NULL, telecaller_ptp_date=NULL WHERE ptp_date IS NOT NULL OR telecaller_ptp_date IS NOT NULL`);
      await storage.query(`UPDATE bkt_cases SET ptp_date=NULL, telecaller_ptp_date=NULL WHERE ptp_date IS NOT NULL OR telecaller_ptp_date IS NOT NULL`);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/bkt-perf-summary", requireAdmin, async (req, res) => {
    try {
      const result = await storage.query(`WITH norm AS (SELECT *, CASE LOWER(REPLACE(bkt,' ','')) WHEN '1' THEN 'bkt1' WHEN '2' THEN 'bkt2' WHEN '3' THEN 'bkt3' WHEN 'bkt1' THEN 'bkt1' WHEN 'bkt2' THEN 'bkt2' WHEN 'bkt3' THEN 'bkt3' ELSE LOWER(REPLACE(bkt,' ','')) END AS bkt_norm FROM bkt_perf_summary), latest AS (SELECT DISTINCT ON (fos_name, bkt_norm) * FROM norm ORDER BY fos_name, bkt_norm, uploaded_at DESC) SELECT fos_name, bkt_norm AS bkt, COALESCE(pos_paid,0) AS pos_paid, COALESCE(pos_unpaid,0) AS pos_unpaid, COALESCE(pos_grand_total,0) AS pos_grand_total, COALESCE(pos_percentage,0) AS pos_percentage, COALESCE(count_paid,0) AS count_paid, COALESCE(count_unpaid,0) AS count_unpaid, COALESCE(count_total,0) AS count_total, COALESCE(rollback_paid,0) AS rollback_paid, COALESCE(rollback_unpaid,0) AS rollback_unpaid, COALESCE(rollback_grand_total,0) AS rollback_grand_total, COALESCE(rollback_percentage,0) AS rollback_percentage FROM latest ORDER BY fos_name, bkt_norm`);
      res.json({ rows: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bkt-tw-collection-summary", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const result = await storage.query(
        `SELECT
           bkt_key AS case_category,
           COUNT(*) FILTER (WHERE status = 'Paid')::int AS count_paid,
           COUNT(*)::int AS count_total,
           COALESCE(SUM(pos::numeric), 0) AS amount_total,
           COALESCE((
             SELECT SUM(fd.amount)
             FROM fos_depositions fd
             WHERE fd.agent_id = $1
               AND LOWER(REPLACE(fd.bkt, ' ', '')) = bkt_key
               AND DATE_TRUNC('month', fd.deposition_date) = DATE_TRUNC('month', CURRENT_DATE)
           ), 0) AS amount_collected
         FROM (
           SELECT 'bkt' || bkt::text AS bkt_key, pos, status
           FROM loan_cases
           WHERE agent_id = $1 AND bkt IN (1, 2, 3) AND pos IS NOT NULL
           UNION ALL
           SELECT case_category AS bkt_key, pos, status
           FROM bkt_cases
           WHERE agent_id = $1 AND case_category IN ('bkt1','bkt2','bkt3') AND pos IS NOT NULL
         ) combined
         GROUP BY bkt_key
         ORDER BY bkt_key`,
        [agentId]
      );
      res.json({ summary: result.rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/bkt-perf-summary", requireAuth, async (req, res) => {
    try {
      const agentId = req.session.agentId!;
      const result = await storage.query(`
        WITH imported_norm AS (SELECT *, CASE LOWER(REPLACE(bkt,' ','')) WHEN '1' THEN 'bkt1' WHEN '2' THEN 'bkt2' WHEN '3' THEN 'bkt3' WHEN 'bkt1' THEN 'bkt1' WHEN 'bkt2' THEN 'bkt2' WHEN 'bkt3' THEN 'bkt3' ELSE LOWER(REPLACE(bkt,' ','')) END AS bkt_norm FROM bkt_perf_summary WHERE agent_id=$1),
        imported_latest AS (SELECT DISTINCT ON (bkt_norm) * FROM imported_norm ORDER BY bkt_norm, uploaded_at DESC),
        covered_bkts AS (SELECT bkt_norm FROM imported_latest WHERE bkt_norm IN ('bkt1','bkt2','bkt3')),
        live_cases AS (
          SELECT LOWER(REPLACE(bc.case_category,' ','')) AS bkt, bc.pos::numeric AS pos, bc.status, bc.rollback_yn FROM bkt_cases bc WHERE bc.agent_id=$1 AND LOWER(REPLACE(bc.case_category,' ','')) IN ('bkt1','bkt2','bkt3') AND LOWER(REPLACE(bc.case_category,' ','')) NOT IN (SELECT bkt_norm FROM covered_bkts) AND UPPER(COALESCE(bc.pro,''))<>'UC'
          UNION ALL SELECT 'bkt'||lc.bkt::text AS bkt, lc.pos::numeric AS pos, lc.status, lc.rollback_yn FROM loan_cases lc WHERE lc.agent_id=$1 AND lc.bkt IS NOT NULL AND 'bkt'||lc.bkt::text NOT IN (SELECT bkt_norm FROM covered_bkts) AND UPPER(COALESCE(lc.pro,''))<>'UC'
        ),
        live_agg AS (SELECT bkt, COALESCE(SUM(pos) FILTER (WHERE status='Paid'),0) AS pos_paid, COALESCE(SUM(pos) FILTER (WHERE status<>'Paid'),0) AS pos_unpaid, COALESCE(SUM(pos),0) AS pos_grand_total, CASE WHEN COALESCE(SUM(pos),0)>0 THEN ROUND((COALESCE(SUM(pos) FILTER (WHERE status='Paid'),0)/SUM(pos))*100,2) ELSE 0 END AS pos_percentage, COUNT(*) FILTER (WHERE status='Paid')::int AS count_paid, COUNT(*) FILTER (WHERE status<>'Paid')::int AS count_unpaid, COUNT(*)::int AS count_total, COALESCE(SUM(pos) FILTER (WHERE rollback_yn=true),0) AS rollback_paid, COALESCE(SUM(pos) FILTER (WHERE rollback_yn IS DISTINCT FROM true),0) AS rollback_unpaid, COALESCE(SUM(pos),0) AS rollback_grand_total, CASE WHEN COALESCE(SUM(pos),0)>0 THEN ROUND((COALESCE(SUM(pos) FILTER (WHERE rollback_yn=true),0)/SUM(pos))*100,2) ELSE 0 END AS rollback_percentage FROM live_cases GROUP BY bkt),
        combined AS (SELECT bkt_norm AS bkt, COALESCE(pos_paid,0) AS pos_paid, COALESCE(pos_unpaid,0) AS pos_unpaid, COALESCE(pos_grand_total,0) AS pos_grand_total, COALESCE(pos_percentage,0) AS pos_percentage, COALESCE(count_paid,0) AS count_paid, COALESCE(count_unpaid,0) AS count_unpaid, COALESCE(count_total,0) AS count_total, COALESCE(rollback_paid,0) AS rollback_paid, COALESCE(rollback_unpaid,0) AS rollback_unpaid, COALESCE(rollback_grand_total,0) AS rollback_grand_total, COALESCE(rollback_percentage,0) AS rollback_percentage FROM imported_latest UNION ALL SELECT * FROM live_agg)
        SELECT * FROM combined ORDER BY bkt
      `, [agentId]);
      res.json({ rows: result.rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/import-bkt-perf", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ejWorkbook3 = new ExcelJS.Workbook(); await ejWorkbook3.xlsx.load(req.file.buffer);
      const worksheet3 = ejWorkbook3.worksheets[0]; const rawRows: any[][] = worksheetToRows(worksheet3, false);
      if (rawRows.length === 0) return res.json({ imported: 0, skipped: 0, errors: [] });
      const cn = (v: any): number => { if (v === "" || v === null || v === undefined) return 0; return parseFloat(String(v).replace(/[,%₹\s]/g, "")) || 0; };
      const toPct = (v: any): number => { const raw = cn(v); return raw > 0 && raw <= 1 ? raw * 100 : raw; };
      const bktValue = "penal";
      let headerIdx = -1, cFos = -1, cVal = -1, cPaid = -1, cUnpaid = -1, cGt = -1, cPct = -1, cRbVal = -1, cRb = -1, cRbGt = -1, cRbPct = -1;
      for (let r = 0; r < rawRows.length; r++) {
        const row = rawRows[r]; const norm = (v: any) => String(v || "").toLowerCase().trim().replace(/[\s_]/g, ""); const cells = row.map(norm);
        if (!cells.some((c) => c === "values" || c === "value") || !cells.some((c) => c === "paid")) continue;
        headerIdx = r; let fosCount = 0, valCount = 0, gtCount = 0, pctCount = 0;
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
      if (headerIdx === -1) return res.status(400).json({ message: "Could not find header row." });
      const fosData: Record<string, any> = {}; let currentFos = "";
      for (let r = headerIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        const fosCell = cFos >= 0 ? String(row[cFos] || "").trim() : "";
        const valCell = cVal >= 0 ? String(row[cVal] || "").trim().toLowerCase() : "";
        if (fosCell.toLowerCase().includes("grand total")) continue;
        if (fosCell && fosCell.toLowerCase() !== "grand total") currentFos = fosCell;
        if (!currentFos || !valCell) continue;
        if (!fosData[currentFos]) fosData[currentFos] = { posPaid: 0, posUnpaid: 0, posGrandTotal: 0, posPercentage: 0, countPaid: 0, countUnpaid: 0, countTotal: 0, rollbackPaid: 0, rollbackGrandTotal: 0, rollbackPercentage: 0 };
        const d = fosData[currentFos];
        if (valCell.includes("sum of pos") || valCell.includes("sum of po")) { d.posPaid = cPaid >= 0 ? cn(row[cPaid]) : d.posPaid; d.posUnpaid = cUnpaid >= 0 ? cn(row[cUnpaid]) : d.posUnpaid; d.posGrandTotal = cGt >= 0 ? cn(row[cGt]) : d.posGrandTotal; d.posPercentage = cPct >= 0 ? toPct(row[cPct]) : d.posPercentage; d.rollbackPaid = cRb >= 0 ? cn(row[cRb]) : d.rollbackPaid; d.rollbackGrandTotal = cRbGt >= 0 ? cn(row[cRbGt]) : d.rollbackGrandTotal; d.rollbackPercentage = cRbPct >= 0 ? toPct(row[cRbPct]) : d.rollbackPercentage; }
        else if (valCell.includes("cbc+lpp") || valCell.includes("cbclpp") || valCell.includes("cbc lpp") || valCell.includes("sum of cbc") || (valCell.includes("cbc") && valCell.includes("lpp"))) { d.posPaid = cPaid >= 0 ? cn(row[cPaid]) : d.posPaid; d.posUnpaid = cUnpaid >= 0 ? cn(row[cUnpaid]) : d.posUnpaid; d.posGrandTotal = cGt >= 0 ? cn(row[cGt]) : d.posGrandTotal; d.posPercentage = cPct >= 0 ? toPct(row[cPct]) : d.posPercentage; }
        else if (valCell.includes("count") || valCell.includes("col cbc") || (valCell.includes("col") && valCell.includes("cbc"))) { d.countPaid = cPaid >= 0 ? Math.round(cn(row[cPaid])) : d.countPaid; d.countUnpaid = cUnpaid >= 0 ? Math.round(cn(row[cUnpaid])) : d.countUnpaid; d.countTotal = cGt >= 0 ? Math.round(cn(row[cGt])) : d.countTotal; }
      }
      const { rows: existingAgents } = await storage.query(`SELECT id, name FROM fos_agents WHERE name IS NOT NULL`);
      const agentByName: Record<string, number> = {};
      for (const a of existingAgents) { if (a.name) agentByName[a.name.toLowerCase().trim()] = a.id; }
      let imported = 0, skipped = 0; const errors: string[] = [];
      for (const fosName of Object.keys(fosData)) {
        const d = fosData[fosName]; d.posGrandTotal = d.posPaid + d.posUnpaid;
        const fosLower = fosName.toLowerCase();
        let agentId: number | null = agentByName[fosLower] || null;
        if (!agentId) { try { const username = fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, ""); const newAgent = await storage.createFosAgent({ name: fosName, username, password: randomBytes(16).toString("hex") }); agentByName[fosLower] = newAgent.id; agentId = newAgent.id; } catch { const found = await storage.getAgentByUsername(fosLower.replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "")); if (found) { agentByName[fosLower] = found.id; agentId = found.id; } } }
        try { await storage.upsertBktPerfSummary({ fosName, agentId, bkt: bktValue, posPaid: d.posPaid, posUnpaid: d.posUnpaid, posGrandTotal: d.posGrandTotal, posPercentage: d.posPercentage, countPaid: d.countPaid, countUnpaid: d.countUnpaid, countTotal: d.countTotal, rollbackPaid: d.rollbackPaid, rollbackUnpaid: Math.max(0, d.rollbackGrandTotal - d.rollbackPaid), rollbackGrandTotal: d.rollbackGrandTotal, rollbackPercentage: d.rollbackPercentage }); imported++; }
        catch (e: any) { errors.push(`${fosName}: ${e.message}`); skipped++; }
      }
      res.json({ imported, skipped, total: Object.keys(fosData).length, bkt: bktValue, errors: errors.slice(0, 20) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/reset-feedback/agent/:agentId", requireAdmin, async (req, res) => {
    try {
      const agentId = Number(req.params.agentId);
      const agentRow = await storage.query("SELECT name FROM fos_agents WHERE id=$1", [agentId]);
      if (!agentRow.rows[0]) return res.status(404).json({ message: "Agent not found" });
      await storage.query(`UPDATE loan_cases SET latest_feedback=NULL, feedback_comments=NULL, feedback_code=NULL, customer_available=NULL, vehicle_available=NULL, third_party=NULL, third_party_name=NULL, third_party_number=NULL, projection=NULL, non_starter=NULL, kyc_purchase=NULL, workable=NULL, feedback_date=NULL, monthly_feedback=NULL WHERE agent_id=$1`, [agentId]);
      await storage.query(`UPDATE bkt_cases SET latest_feedback=NULL, feedback_comments=NULL, feedback_code=NULL, customer_available=NULL, vehicle_available=NULL, third_party=NULL, third_party_name=NULL, third_party_number=NULL, projection=NULL, non_starter=NULL, kyc_purchase=NULL, workable=NULL, feedback_date=NULL, monthly_feedback=NULL WHERE agent_id=$1`, [agentId]);
      res.json({ success: true, message: `All feedback reset for ${agentRow.rows[0].name}` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/reset-feedback/case/:caseId", requireAdmin, async (req, res) => {
    try {
      const caseId = Number(req.params.caseId); const { table } = req.body;
      const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
      await storage.query(`UPDATE ${tbl} SET latest_feedback=NULL, feedback_comments=NULL, feedback_code=NULL, customer_available=NULL, vehicle_available=NULL, third_party=NULL, third_party_name=NULL, third_party_number=NULL, projection=NULL, non_starter=NULL, kyc_purchase=NULL, workable=NULL, feedback_date=NULL, monthly_feedback=NULL, status='Unpaid' WHERE id=$1`, [caseId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

app.post("/api/admin/reset-monthly-feedback/agent/:agentId", requireAdmin, async (req, res) => {
  try {
    const agentId = Number(req.params.agentId);
    const agentRow = await storage.query("SELECT name FROM fos_agents WHERE id=$1", [agentId]);
    if (!agentRow.rows[0]) return res.status(404).json({ message: "Agent not found" });
    await storage.query(`UPDATE loan_cases SET monthly_feedback=NULL WHERE agent_id=$1`, [agentId]);
    await storage.query(`UPDATE bkt_cases SET monthly_feedback=NULL WHERE agent_id=$1`, [agentId]);
    res.json({ success: true, message: `Monthly feedback reset for ${agentRow.rows[0].name}` });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.post("/api/admin/reset-monthly-feedback/case/:caseId", requireAdmin, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    const { table } = req.body;
    const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
    await storage.query(`UPDATE ${tbl} SET monthly_feedback=NULL WHERE id=$1`, [caseId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  app.put("/api/admin/cases/:id/status", requireAdmin, async (req, res) => {
    try {
      const caseId = Number(req.params.id); const { status, rollback_yn, table } = req.body;
      const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
      const oldRow = await storage.query(`SELECT status, rollback_yn, pos::numeric AS pos, agent_id, ${table === "bkt" ? "case_category AS bkt_key" : "bkt::text AS bkt_key"}, pro FROM ${tbl} WHERE id=$1`, [caseId]);
      const old = oldRow.rows[0];
      if (!old) return res.status(404).json({ message: "Case not found" });
      const ynVal = rollback_yn === true || rollback_yn === "true" ? true : rollback_yn === false || rollback_yn === "false" ? false : null;
      await storage.query(`UPDATE ${tbl} SET status=$1, rollback_yn=$2, updated_at=NOW() WHERE id=$3`, [status, ynVal, caseId]);
      if (old.bkt_key && old.agent_id && !["UC","RUC"].includes((old.pro || "").toUpperCase())) {
        const pos = parseFloat(old.pos) || 0;
        const bktKey = table === "bkt" ? old.bkt_key.toLowerCase().replace(/\s+/g, "") : `bkt${old.bkt_key}`;
        const wasPaid = old.status === "Paid"; const nowPaid = status === "Paid";
        const wasRb = old.rollback_yn === true; const nowRb = ynVal === true;
        const dPos = !wasPaid && nowPaid ? pos : wasPaid && !nowPaid ? -pos : 0;
        const dCount = !wasPaid && nowPaid ? 1 : wasPaid && !nowPaid ? -1 : 0;
        const dRb = !wasRb && nowRb ? pos : wasRb && !nowRb ? -pos : 0;
        await storage.applyBktPerfDelta(old.agent_id, bktKey, dPos, -dPos, dCount, -dCount, dRb, -dRb);
      }
      if (old.agent_id) {
        const agentRow = await storage.query("SELECT push_token FROM fos_agents WHERE id=$1", [old.agent_id]);
        const playerId = agentRow.rows[0]?.push_token;
        if (playerId) { const caseRow = await storage.query(`SELECT customer_name, loan_no FROM ${tbl} WHERE id=$1`, [caseId]); const c = caseRow.rows[0]; if (c) await sendPush(playerId, status === "Paid" ? "✅ Case Marked Paid" : status === "Unpaid" ? "❌ Case Marked Unpaid" : "🔄 Status Updated", `${c.customer_name} (${c.loan_no}) marked ${status} by admin.`, { type: "status_update", caseId, status }); }
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Background Jobs ────────────────────────────────────────────────────────────
  const ptpReminderSentDates = new Set<string>();
  async function runPtpPushJob() {
    try {
      const { hour, todayKey } = getISTHour(); const isMorning = hour === 9; const isAfternoon = hour === 13;
      if (!isMorning && !isAfternoon) return;
      const slotKey = `${todayKey}-${hour}`; if (ptpReminderSentDates.has(slotKey)) return;
      const agents = await storage.query(`SELECT id, name, push_token FROM fos_agents WHERE role='fos' AND push_token IS NOT NULL AND push_token<>''`);
      for (const agent of agents.rows) {
        const result = await storage.query(`SELECT COUNT(*) AS cnt FROM (SELECT id FROM loan_cases WHERE agent_id=$1 AND ((status='PTP' AND (ptp_date IS NULL OR ptp_date<=CURRENT_DATE)) OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date<=CURRENT_DATE)) UNION ALL SELECT id FROM bkt_cases WHERE agent_id=$1 AND ((status='PTP' AND (ptp_date IS NULL OR ptp_date<=CURRENT_DATE)) OR (telecaller_ptp_date IS NOT NULL AND telecaller_ptp_date<=CURRENT_DATE))) t`, [agent.id]);
        const cnt = parseInt(result.rows[0]?.cnt || "0", 10);
        if (cnt > 0) await sendPush(agent.push_token, isMorning ? "📅 Good Morning — PTP Due Today" : "📅 Afternoon Reminder", `You have ${cnt} PTP case${cnt !== 1 ? "s" : ""} due today!`, { screen: "dashboard" });
      }
      ptpReminderSentDates.add(slotKey);
      if (ptpReminderSentDates.size > 14) ptpReminderSentDates.delete(ptpReminderSentDates.values().next().value);
    } catch (e: any) { console.error("[ptp-job]", e.message); }
  }
  runPtpPushJob(); setInterval(runPtpPushJob, 10 * 60 * 1000);

  async function runReminderJob() {
    try {
      const result = await storage.query(`SELECT rd.id, rd.agent_id, rd.amount, rd.created_at, rd.last_reminder_at, fa.push_token FROM required_deposits rd JOIN fos_agents fa ON fa.id=rd.agent_id WHERE rd.screenshot_url IS NULL AND (rd.cash_collected IS NULL OR rd.cash_collected=FALSE) AND fa.push_token IS NOT NULL AND fa.push_token<>'' AND (rd.last_reminder_at IS NULL OR rd.last_reminder_at<NOW()-INTERVAL '1 hour')`);
      for (const row of result.rows) {
        const hoursElapsed = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 3600000);
        const amtStr = parseFloat(row.amount).toLocaleString("en-IN");
        await sendPush(row.push_token, hoursElapsed === 0 ? "💰 Deposit Assigned" : `⏰ Deposit Reminder — ${hoursElapsed}h Pending`, hoursElapsed === 0 ? `Admin assigned ₹${amtStr}. Upload screenshot.` : `Upload ₹${amtStr} screenshot now! ${hoursElapsed}h elapsed.`, { screen: "deposition" });
        await storage.query(`UPDATE required_deposits SET last_reminder_at=NOW() WHERE id=$1`, [row.id]);
      }
    } catch (e: any) { console.error("[reminder-job]", e.message); }
  }
  runReminderJob(); setInterval(runReminderJob, 60 * 60 * 1000);

  async function runFosDepositionReminderJob() {
    try {
      const result = await storage.query(`SELECT fa.id AS agent_id, fa.name AS agent_name, fa.push_token, COUNT(fd.id)::int AS pending_count, SUM(fd.amount)::numeric AS pending_total, MIN(fd.created_at) AS oldest_at FROM fos_agents fa JOIN fos_depositions fd ON fd.agent_id=fa.id AND fd.payment_method='pending' WHERE fa.push_token IS NOT NULL AND fa.push_token<>'' GROUP BY fa.id, fa.name, fa.push_token HAVING COUNT(fd.id)>0`);
      for (const row of result.rows) {
        const count = parseInt(row.pending_count || 0); const total = parseFloat(row.pending_total || 0).toLocaleString("en-IN"); const hoursOld = Math.floor((Date.now() - new Date(row.oldest_at).getTime()) / 3600000);
        await sendPush(row.push_token, `⏳ Pending Payment Reminder`, `You have ${count} pending deposit${count > 1 ? "s" : ""} totalling ₹${total} (${hoursOld}h old).`, { screen: "fos-depositions", type: "fos_dep_reminder" });
      }
    } catch (e: any) { console.error("[fos-dep-reminder]", e.message); }
  }
  runFosDepositionReminderJob(); setInterval(runFosDepositionReminderJob, 60 * 60 * 1000);

  const batchReminderSentDates = new Set<string>();
  async function runBatchReminderJob() {
    try {
      const { hour, todayKey } = getISTHour(); if (hour < 19 || hour > 20) return; if (batchReminderSentDates.has(todayKey)) return;
      const agents = await storage.query(`SELECT id, push_token FROM fos_agents WHERE role='fos' AND push_token IS NOT NULL AND push_token<>''`);
      let sent = 0;
      for (const agent of agents.rows) {
        const statsResult = await storage.query(`SELECT COUNT(*) FILTER (WHERE status='Paid')::int AS paid_count, COUNT(*) FILTER (WHERE status='Unpaid')::int AS unpaid_count, COUNT(*) FILTER (WHERE status='PTP')::int AS ptp_count, COUNT(*)::int AS total FROM (SELECT status FROM loan_cases WHERE agent_id=$1 UNION ALL SELECT status FROM bkt_cases WHERE agent_id=$1) t`, [agent.id]);
        const s = statsResult.rows[0]; const total = parseInt(s?.total || "0", 10); if (total === 0) continue;
        const r = await sendPush(agent.push_token, "📊 End of Day Summary", `Today: ✅ ${s.paid_count} Paid | 🔄 ${s.ptp_count} PTP | ❌ ${s.unpaid_count} Unpaid out of ${total} cases.`, { screen: "dashboard", type: "daily_summary" });
        if (r.ok) sent++;
      }
      batchReminderSentDates.add(todayKey); if (batchReminderSentDates.size > 7) batchReminderSentDates.delete(batchReminderSentDates.values().next().value);
    } catch (e: any) { console.error("[batch-reminder]", e.message); }
  }
  runBatchReminderJob(); setInterval(runBatchReminderJob, 10 * 60 * 1000);

  const monthlyCleanupDone = new Set<string>();
  async function runMonthlyCleanupJob() {
    try {
      const now = new Date(); const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const day = ist.getUTCDate(); const month = ist.getUTCMonth() + 1; const year = ist.getUTCFullYear();
      if (day !== 1) return;
      const monthKey = `${year}-${String(month).padStart(2, "0")}`; if (monthlyCleanupDone.has(monthKey)) return;
      const deleteResult = await storage.query(`DELETE FROM fos_depositions WHERE DATE_TRUNC('month', deposition_date) < DATE_TRUNC('month', CURRENT_DATE)`);
      console.log(`[monthly-cleanup] ✅ Deleted ${deleteResult.rowCount ?? 0} old records`);
      try {
        const uploadsDir = path.join(process.cwd(), "server/uploads/screenshots"); const cutoff = new Date(year, month - 2, 1);
        const files = fs.readdirSync(uploadsDir); let deletedFiles = 0;
        for (const file of files) { try { const stat = fs.statSync(path.join(uploadsDir, file)); if (stat.mtime < cutoff) { fs.unlinkSync(path.join(uploadsDir, file)); deletedFiles++; } } catch {} }
        console.log(`[monthly-cleanup] 🖼️ Deleted ${deletedFiles} old screenshots`);
      } catch {}
      monthlyCleanupDone.add(monthKey); if (monthlyCleanupDone.size > 3) monthlyCleanupDone.delete(monthlyCleanupDone.values().next().value);
    } catch (e: any) { console.error("[monthly-cleanup]", e.message); }
  }
  runMonthlyCleanupJob(); setInterval(runMonthlyCleanupJob, 60 * 60 * 1000);

  const drrPushSentDates = new Set<string>();

  async function runDrrDailyPushJob() {
    try {
      const { hour, todayKey } = getISTHour();
      if (hour !== 10) return;

      const slotKey = `${todayKey}-drr-10`;
      if (drrPushSentDates.has(slotKey)) return;

      const istDate = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
      const dayOfMonth = istDate.getUTCDate();

      const MILESTONES = [
        { day: 10, label: "1st Milestone", targets: { bkt1: 28, bkt2: 22, bkt3: 18 } },
        { day: 15, label: "2nd Milestone", targets: { bkt1: 60, bkt2: 48, bkt3: 40 } },
        { day: 20, label: "3rd Milestone", targets: { bkt1: 80, bkt2: 65, bkt3: 45 } },
        { day: 25, label: "4th Milestone", targets: { bkt1: 85, bkt2: 68, bkt3: 60 } },
      ];
      const nextMilestone = MILESTONES.find((m) => m.day >= dayOfMonth) ?? MILESTONES[MILESTONES.length - 1];
      const daysLeft = Math.max(0, nextMilestone.day - dayOfMonth);
      const effectiveDays = Math.max(1, daysLeft);

      const agents = await storage.query(
        `SELECT id, name, push_token FROM fos_agents WHERE role='fos' AND push_token IS NOT NULL AND push_token != ''`
      );
      console.log(`[drr-push] Day ${dayOfMonth} | ${daysLeft}d to ${nextMilestone.label} | ${agents.rows.length} agents`);

      const fmtAmt = (v: number) =>
        v >= 100000 ? `₹${(v / 100000).toFixed(1)}L`
        : v >= 1000  ? `₹${(v / 1000).toFixed(1)}K`
        : `₹${Math.round(v)}`;

      let sent = 0;
      for (const agent of agents.rows) {
        try {
          const perfResult = await storage.query(
            `SELECT bkt,
                    COALESCE(pos_paid::numeric, 0)        AS pos_paid,
                    COALESCE(pos_grand_total::numeric, 0) AS pos_grand_total
             FROM bkt_perf_summary
             WHERE agent_id = $1 AND bkt IN ('bkt1','bkt2','bkt3')`,
            [agent.id]
          );

          const bktMap: Record<string, { paid: number; total: number }> = {
            bkt1: { paid: 0, total: 0 },
            bkt2: { paid: 0, total: 0 },
            bkt3: { paid: 0, total: 0 },
          };
          for (const row of perfResult.rows) {
            const key = (row.bkt || "").toLowerCase();
            if (bktMap[key]) {
              bktMap[key].paid  = parseFloat(row.pos_paid) || 0;
              bktMap[key].total = parseFloat(row.pos_grand_total) || 0;
            }
          }

          const totalPaid = Object.values(bktMap).reduce((s, b) => s + b.paid,  0);
          const totalPos  = Object.values(bktMap).reduce((s, b) => s + b.total, 0);
          if (totalPos === 0) continue;

          const overallPct = (totalPaid / totalPos) * 100;

          const bktLines: string[] = [];
          let totalRemaining = 0;

          for (const bkt of ["bkt1", "bkt2", "bkt3"] as const) {
            const d = bktMap[bkt];
            if (!d || d.total === 0) continue;
            const targetPct    = nextMilestone.targets[bkt];
            const targetAmount = (targetPct / 100) * d.total;
            const remaining    = Math.max(0, targetAmount - d.paid);
            totalRemaining    += remaining;
            const currentPct   = d.total > 0 ? (d.paid / d.total) * 100 : 0;
            const label        = bkt === "bkt1" ? "B1" : bkt === "bkt2" ? "B2" : "B3";
            bktLines.push(currentPct >= targetPct ? `${label}:✅` : `${label}:${fmtAmt(remaining / effectiveDays)}/d`);
          }

          const overallDailyNeed = totalRemaining / effectiveDays;
          const daysText = daysLeft === 0 ? "Milestone day TODAY!" : `${daysLeft}d left`;
          const title = `📊 Daily DRR — Day ${dayOfMonth}`;
          const body  = totalRemaining <= 0
            ? `🎉 All targets met! Overall: ${overallPct.toFixed(1)}% ✅`
            : `${overallPct.toFixed(1)}% done | Need ${fmtAmt(overallDailyNeed)}/day\n${daysText} | ${bktLines.join("  ")}`;

          const r = await sendPush(agent.push_token, title, body, { screen: "drr", type: "drr_daily" });
          if (r.ok) sent++;
        } catch (agentErr: any) {
          console.error(`[drr-push] Error for agent ${agent.id}:`, agentErr.message);
        }
      }

      drrPushSentDates.add(slotKey);
      if (drrPushSentDates.size > 14) drrPushSentDates.delete(drrPushSentDates.values().next().value);
      console.log(`[drr-push] ✅ Done — sent to ${sent}/${agents.rows.length} agents`);
    } catch (e: any) {
      console.error("[drr-push] Job error:", e.message);
    }
  }

  runDrrDailyPushJob();
  setInterval(runDrrDailyPushJob, 10 * 60 * 1000);

// ── PDF helpers ───────────────────────────────────────────────────────────────

function buildPreIntimationPdf(
  doc: any,
  p: ReturnType<typeof buildIntimationParams>,
  logoPath: string
) {
  const lm         = doc.page.margins.left;
  const rm         = doc.page.width - doc.page.margins.right;
  const pageWidth  = rm - lm;
  const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const fsNode     = require("fs");
 
  const logoW  = 110;
  const logoH  = 50;
  const startY = doc.page.margins.top;
 
  if (fsNode.existsSync(logoPath)) {
    try {
      doc.image(fsNode.readFileSync(logoPath), rm - logoW, startY, {
        width: logoW, height: logoH,
      });
    } catch {}
  }
 
  const titleAreaW    = pageWidth - logoW - 10;
  const titleFontSize = 13;
  doc.font("Helvetica-Bold").fontSize(titleFontSize).text(
    "Pre Repossession Intimation to Police Station",
    lm, startY + (logoH - titleFontSize * 1.2) / 2,
    { align: "center", width: titleAreaW }
  );
 
  doc.y = startY + logoH + 4;
 
  doc.moveTo(lm, doc.y).lineTo(rm, doc.y).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
  doc.strokeColor("#000000").lineWidth(1);
  doc.moveDown(0.6);
 
  doc.font("Helvetica-Bold").fontSize(10.5)
    .text(`Date :- ${p.date}`, lm, doc.y, { align: "right", width: pageWidth });
  doc.moveDown(0.8);
 
  const policeLabel =
    p.police_station && p.police_station !== "________________________________"
      ? `${p.police_station} Police Station,`
      : "________________________________,";
 
  doc.font("Helvetica").fontSize(10.5);
  doc.text("To,", lm);                                    doc.moveDown(0.25);
  doc.text("The Senior Inspector,", lm);                  doc.moveDown(0.25);
  doc.text(policeLabel, lm);                              doc.moveDown(0.25);
  doc.text(`TQ. ${p.tq}     Dist. Nanded`, lm);
  doc.moveDown(0.8);
 
  doc.font("Helvetica").fontSize(10.5).text(
    `Sub :- Pre intimation of repossession of the vehicle from ${p.customer_name}`,
    lm, doc.y, { width: pageWidth }
  );
  doc.moveDown(0.25);
  doc.text(`(Borrower) residing ${p.address}`, lm, doc.y, { width: pageWidth });
  doc.moveDown(0.8);
 
  doc.font("Helvetica-Bold").fontSize(10.5).text("Respected Sir,", lm);
  doc.moveDown(0.6);
 
  doc.font("Helvetica").fontSize(10.5).text(
    'The afore mentioned borrower has taken a loan from Hero Fin-Corp Limited ("Company") for the' +
    " purchase of the Vehicle having the below mentioned details and further the Borrower hypothecated" +
    " the said vehicle to the Company in terms of loan-cum-hypothecation agreement executed between" +
    " the borrower and the Company.",
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.7);
 
  const col1W = pageWidth * 0.46;
  const detailRows: [string, string][] = [
    ["Name of the Borrower",                 p.customer_name],
    ["Address of Borrower",                  p.address],
    ["App ID",                               p.app_id],
    ["Loan cum Hypothecation Agreement No.", p.loan_no],
    ["Date",                                 p.date],
    ["Vehicle Registration No.",             p.registration_no],
    ["Model Make",                           p.asset_make],
    ["Engine No.",                           p.engine_no],
    ["Chassis No.",                          p.chassis_no],
  ];
 
  doc.font("Helvetica").fontSize(10.5);
  detailRows.forEach(([label, value]) => {
    const rowY = doc.y;
    doc.fillColor("#333333").text(label, lm, rowY, { width: col1W - 4, lineBreak: false });
    doc.fillColor("#000000").text(`: ${value || "—"}`, lm + col1W, rowY, {
      width: pageWidth - col1W,
    });
    doc.moveDown(0.28);
  });
  doc.moveDown(0.7);
 
  doc.font("Helvetica").fillColor("#000000").fontSize(10.5).text(
    "The Borrower has committed default on the scheduled payment of the Monthly Payments and/or" +
    " other charges payable on the loan obtained by the Borrower from the Company in terms of the" +
    " provisions of the aforesaid loan-cum-hypothecation agreement. In spite of Company's requests" +
    " and reminders, the Borrower has not remitted the outstanding dues; as a result of which the" +
    " company was left with no option but to enforce the terms and conditions of the said agreement." +
    " Under the said agreement, the said Borrower has specifically authorized Company or any of its" +
    " authorized persons to take charge/repossession of the vehicle, in the event he fails to pay" +
    " the loan amount when due to the Company. Pursuant to our right therein we are taking steps to" +
    " recover possession of the said vehicle. This communication is for your record and to prevent" +
    " confusion that may arise from any complaint that the borrower may lodge with respect to the" +
    " aforesaid vehicle.",
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.8);
 
  doc.font("Helvetica").fontSize(10.5).text("Thanking you,", lm);
  doc.moveDown(0.3);
  doc.text("Yours Sincerely,", lm);
 
  const footerAbsY  = doc.page.margins.top + pageHeight;
  const forLineH    = 10.5 + 6;
  const footerLineH = 9 + 12;
  const sigTargetY  = footerAbsY - footerLineH - forLineH - 24;
  if (sigTargetY > doc.y + 8) doc.y = sigTargetY;
  else doc.moveDown(1.5);
 
  doc.font("Helvetica").fontSize(10.5).text("For, Hero Fin-Corp Limited", lm);
  doc.moveDown(1.0);
 
  doc.moveTo(lm, doc.y).lineTo(rm, doc.y).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
  doc.strokeColor("#000000").lineWidth(1);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000").text(
    "Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India",
    lm, doc.y, { align: "center", width: pageWidth }
  );
}
 
function buildPostIntimationPdf(
  doc: any,
  p: ReturnType<typeof buildIntimationParams>,
  logoPath: string
) {
  const lm         = doc.page.margins.left;
  const rm         = doc.page.width - doc.page.margins.right;
  const pageWidth  = rm - lm;
  const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const fsNode     = require("fs");
 
  const logoW  = 110;
  const logoH  = 50;
  const startY = doc.page.margins.top;
 
  if (fsNode.existsSync(logoPath)) {
    try {
      doc.image(fsNode.readFileSync(logoPath), rm - logoW, startY, {
        width: logoW, height: logoH,
      });
    } catch {}
  }
 
  const titleAreaW    = pageWidth - logoW - 10;
  const titleFontSize = 13;
  const titleText     = "Post Repossession Intimation to Police Station";
 
  doc.font("Helvetica-Bold").fontSize(titleFontSize).text(
    titleText,
    lm, startY + (logoH - titleFontSize * 1.2) / 2,
    { align: "center", width: titleAreaW }
  );
 
  const tw           = doc.widthOfString(titleText, { fontSize: titleFontSize });
  const titleCentreX = lm + (titleAreaW - tw) / 2;
  const underlineY   = startY + (logoH - titleFontSize * 1.2) / 2 + titleFontSize * 1.15;
  doc.moveTo(titleCentreX, underlineY)
    .lineTo(titleCentreX + tw, underlineY)
    .strokeColor("#000000").lineWidth(0.7).stroke();
  doc.strokeColor("#000000").lineWidth(1);
 
  doc.y = startY + logoH + 4;
 
  doc.font("Helvetica-Bold").fontSize(10.5)
    .text(`Date :- ${p.date}`, lm, doc.y, { align: "right", width: pageWidth });
  doc.moveDown(0.8);
 
  const policeLabel =
    p.police_station && p.police_station !== "________________________________"
      ? `${p.police_station} Police Station,`
      : "________________________________,";
 
  doc.font("Helvetica").fontSize(10.5);
  doc.text("To,", lm);                                    doc.moveDown(0.25);
  doc.text("The Senior Inspector,", lm);                  doc.moveDown(0.25);
  doc.text(policeLabel, lm);                              doc.moveDown(0.25);
  doc.text(`TQ. ${p.tq}     Dist. Nanded`, lm);
  doc.moveDown(0.8);
 
  doc.font("Helvetica").fontSize(10.5).text(
    `Sub :- Intimation after repossession of the vehicle No ${p.registration_no}` +
    ` From Mr. ${p.customer_name}`,
    lm, doc.y, { width: pageWidth }
  );
  doc.moveDown(0.25);
  doc.text(`(Borrower) residing ${p.address}`, lm, doc.y, { width: pageWidth });
  doc.moveDown(0.8);
 
  doc.font("Helvetica-Bold").fontSize(10.5).text("Respected Sir,", lm);
  doc.moveDown(0.6);
 
  doc.font("Helvetica").fontSize(10.5);
 
  doc.text(
    `This is in furtherance to our letter dated bearing reference number ${p.reference_no}` +
    " whereby it was intimated to you that despite our repeated requests, reminders and personal" +
    " visits the above said borrower has defaulted in repaying the above TW Loan as expressly" +
    " agreed by him/her under the Loan (cum Hypothecation) Agreement and guarantee entered between" +
    " the said borrower and the company.",
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.6);
 
  doc.text(
    "Pursuant to our right under the said Agreement we have taken peaceful repossession of the" +
    " said vehicle.",
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.6);
 
  doc.text(
    `We have taken peaceful repossession of the said vehicle on ${p.repossession_date}` +
    ` at from ${p.repossession_address}`,
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.7);
 
  doc.font("Helvetica-Bold").fontSize(10.5).text("DETAILS OF THE VEHICLE REPOSSESSED:-", lm);
  doc.moveDown(0.5);
 
  const col1W = pageWidth * 0.42;
  const detailRows: [string, string][] = [
    ["Name of the Borrower",        p.customer_name],
    ["Address of Borrower",         p.address],
    ["Loan Agreement No.",          p.loan_no],
    ["App ID",                      p.app_id],
    ["Vehicle Registration Number", p.registration_no],
    ["Model Make",                  p.asset_make],
    ["Engine No.",                  p.engine_no],
    ["Chassis No.",                 p.chassis_no],
  ];
 
  doc.font("Helvetica").fontSize(10.5);
  detailRows.forEach(([label, value]) => {
    const rowY = doc.y;
    doc.fillColor("#333333").text(label, lm, rowY, { width: col1W - 4, lineBreak: false });
    doc.fillColor("#000000").text(`: ${value || "—"}`, lm + col1W, rowY, {
      width: pageWidth - col1W,
    });
    doc.moveDown(0.28);
  });
  doc.moveDown(0.7);
 
  doc.font("Helvetica").fillColor("#000000").fontSize(10.5).text(
    "This communication is for your records and to prevent any confusion that may arise for any" +
    " complaint that the Borrower may lodge with respect to the said vehicle.",
    lm, doc.y, { align: "justify", width: pageWidth }
  );
  doc.moveDown(0.8);
 
  doc.font("Helvetica").fontSize(10.5).text("Thanking You,", lm);
  doc.moveDown(0.3);
  doc.text("Yours Sincerely,", lm);
 
  const footerAbsY  = doc.page.margins.top + pageHeight;
  const forLineH    = 10.5 + 6;
  const footerLineH = 9 + 12;
  const sigTargetY  = footerAbsY - footerLineH - forLineH - 24;
  if (sigTargetY > doc.y + 8) doc.y = sigTargetY;
  else doc.moveDown(1.5);
 
  doc.font("Helvetica").fontSize(10.5).text("For, Hero Fin Corp Limited", lm);
  doc.moveDown(1.0);
 
  doc.moveTo(lm, doc.y).lineTo(rm, doc.y).strokeColor("#bbbbbb").lineWidth(0.5).stroke();
  doc.strokeColor("#000000").lineWidth(1);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000").text(
    "Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India",
    lm, doc.y, { align: "center", width: pageWidth }
  );
}

async function buildIntimationDocx(
  p: ReturnType<typeof buildIntimationParams>,
  isPost: boolean,
  logoPath: string
): Promise<Buffer> {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle,
    WidthType, ImageRun, Table, TableRow, TableCell,
  } = require("docx");
  const fsNode = require("fs");

const logoData: Uint8Array | null = fsNode.existsSync(logoPath) ? new Uint8Array(fsNode.readFileSync(logoPath)) : null;
  const body11 = { size: 22, font: "Arial" };
  const body10 = { size: 20, font: "Arial" };
  const sp     = (n: number) => ({ before: n, after: n });

  const noBorder  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noBorders = {
    top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
    insideH: noBorder, insideV: noBorder,
  };

  function detailRow(label: string, value: string): any {
    return new TableRow({
      children: [
        new TableCell({
          borders: noBorders,
          width: { size: 4200, type: WidthType.DXA },
          margins: { top: 50, bottom: 50, left: 0, right: 60 },
          children: [new Paragraph({ children: [new TextRun({ text: label, color: "333333", ...body10 })] })],
        }),
        new TableCell({
          borders: noBorders,
          width: { size: 180, type: WidthType.DXA },
          margins: { top: 50, bottom: 50, left: 0, right: 0 },
          children: [new Paragraph({ children: [new TextRun({ text: ":", ...body10 })] })],
        }),
        new TableCell({
          borders: noBorders,
          width: { size: 5020, type: WidthType.DXA },
          margins: { top: 50, bottom: 50, left: 60, right: 0 },
          children: [new Paragraph({ children: [new TextRun({ text: value || "—", ...body10 })] })],
        }),
      ],
    });
  }

  function detailsTable(rows: [string, string][]): any {
    return new Table({
      width: { size: 9400, type: WidthType.DXA },
      columnWidths: [4200, 180, 5020],
      borders: noBorders,
      rows: rows.map(([label, value]) => detailRow(label, value)),
    });
  }

  const children: any[] = [];

  if (logoData) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 80 },
      children: [new ImageRun({ data: logoData, transformation: { width: 120, height: 65 }, type: "png" })],
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: sp(60),
    children: [new TextRun({
      text: isPost
        ? "Post Repossession Intimation to Police Station"
        : "Pre Repossession Intimation to Police Station",
      size: 26, font: "Arial", bold: true,
      underline: { type: "single" },
    })],
  }));

  children.push(new Paragraph({
    alignment: isPost ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 20, after: 80 },
    children: [new TextRun({ text: `Date :- ${p.date}`, ...body11 })],
  }));

  const policeLabel = p.police_station && p.police_station !== "________________________________"
    ? `${p.police_station} Police Station,`
    : "________________________________,";

  children.push(
    new Paragraph({ spacing: { before: 40, after: 16 }, children: [new TextRun({ text: "To,", ...body11 })] }),
    new Paragraph({ spacing: { before: 0, after: 16 }, children: [new TextRun({ text: "The Senior Inspector,", ...body11 })] }),
    new Paragraph({ spacing: { before: 0, after: 16 }, children: [new TextRun({ text: policeLabel, ...body11 })] }),
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: `TQ. ${p.tq}     Dist. Nanded`, ...body11 })] })
  );

  if (isPost) {
    children.push(
      new Paragraph({
        spacing: { before: 20, after: 16 },
        children: [new TextRun({ text: `Sub :- Intimation after repossession of the vehicle No ${p.registration_no} From Mr. ${p.customer_name}`, ...body11 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: `(Borrower) residing ${p.address}`, ...body11 })],
      })
    );
  } else {
    children.push(
      new Paragraph({
        spacing: { before: 20, after: 16 },
        children: [new TextRun({ text: `Sub :- Pre intimation of repossession of the vehicle from ${p.customer_name}`, ...body11 })],
      }),
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: `(Borrower) residing ${p.address}`, ...body11 })],
      })
    );
  }

  children.push(new Paragraph({ spacing: { before: 20, after: 40 }, children: [new TextRun({ text: "Respected Sir,", ...body11 })] }));

  if (isPost) {
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 40 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: `This is in furtherance to our letter dated bearing reference number ${p.reference_no} whereby it was intimated to you that despite our repeated requests, reminders and personal visits the above said borrower has defaulted in repaying the above TW Loan as expressly agreed by him/her under the Loan (cum Hypothecation) Agreement and guarantee entered between the said borrower and the company.`, ...body10 })],
      }),
      new Paragraph({
        spacing: { before: 40, after: 40 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: "Pursuant to our right under the said Agreement we have taken peaceful repossession of the said vehicle.", ...body10 })],
      }),
      new Paragraph({
        spacing: { before: 40, after: 60 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: `We have taken peaceful repossession of the said vehicle on ${p.repossession_date} at from ${p.repossession_address}`, ...body10 })],
      }),
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: "DETAILS OF THE VEHICLE REPOSSESSED:-", size: 22, font: "Arial", bold: true })],
      }),
      detailsTable([
        ["Name of the Borrower",        p.customer_name],
        ["Address of Borrower",         p.address],
        ["Loan Agreement No.",          p.loan_no],
        ["App ID",                      p.app_id],
        ["Vehicle Registration Number", p.registration_no],
        ["Model Make",                  p.asset_make],
        ["Engine No.",                  p.engine_no],
        ["Chassis No.",                 p.chassis_no],
      ]),
      new Paragraph({
        spacing: { before: 60, after: 40 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: "This communication is for your records and to prevent any confusion that may arise for any complaint that the Borrower may lodge with respect to the said vehicle.", ...body10 })],
      })
    );
  } else {
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 60 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: 'The afore mentioned borrower has taken a loan from Hero Fin-Corp Limited ("Company") for the purchase of the Vehicle having the below mentioned details and further the Borrower hypothecated the said vehicle to the Company in terms of loan-cum-hypothecation agreement executed between the borrower and the Company.', ...body10 })],
      }),
      detailsTable([
        ["Name of the Borrower",                  p.customer_name],
        ["Address of Borrower",                   p.address],
        ["App ID",                                p.app_id],
        ["Loan cum Hypothecation Agreement No.",  p.loan_no],
        ["Date",                                  p.date],
        ["Vehicle Registration No.",              p.registration_no],
        ["Model Make",                            p.asset_make],
        ["Engine No.",                            p.engine_no],
        ["Chassis No.",                           p.chassis_no],
      ]),
      new Paragraph({
        spacing: { before: 60, after: 40 }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: "The Borrower has committed default on the scheduled payment of the Monthly Payments and/or other charges payable on the loan obtained by the Borrower from the Company in terms of the provisions of the aforesaid loan-cum-hypothecation agreement. In spite of Company's requests and reminders, the Borrower has not remitted the outstanding dues; as a result of which the company was left with no option but to enforce the terms and conditions of the said agreement. Under the said agreement, the said Borrower has specifically authorized Company or any of its authorized persons to take charge/repossession of the vehicle, in the event he fails to pay the loan amount when due to the Company. Pursuant to our right therein we are taking steps to recover possession of the said vehicle. This communication is for your record and to prevent confusion that may arise from any complaint that the borrower may lodge with respect to the aforesaid vehicle.", ...body10 })],
      })
    );
  }

  children.push(
    new Paragraph({ spacing: { before: 60, after: 16 }, children: [new TextRun({ text: "Thanking You,", ...body11 })] }),
    new Paragraph({ spacing: { before: 0, after: 16 }, children: [new TextRun({ text: "Yours Sincerely,", ...body11 })] }),
    new Paragraph({ spacing: { before: 520, after: 60 }, children: [new TextRun({ text: `For, Hero Fin${isPost ? " " : "-"}Corp Limited`, ...body11 })] })
  );

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
    children: [new TextRun({ text: "Hero Fincorp Ltd. Corporate Office: 09, Basant Lok, Vasant Vihar, New Delhi-110057 India", size: 18, font: "Arial" })],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

app.post("/api/admin/generate-pre-intimation", requireAdmin, async (req, res) => {
  try {
    const p           = buildIntimationParams(req.body);
    const logoPath    = path.join(process.cwd(), "assets/images/hero-logo.png");
    const PDFDocument = require("pdfkit");
    const doc         = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 60, right: 60 }, info: { Title: "Pre Repossession Intimation" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => {
      const filename = `Pre_Intimation_${p.customer_name.replace(/\s+/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.end(Buffer.concat(chunks));
    });
    buildPreIntimationPdf(doc, p, logoPath);
    doc.end();
  } catch (err: any) {
    console.error("[pre-intimation PDF]", err);
    res.status(500).json({ message: err.message || "Failed to generate PDF" });
  }
});

app.post("/api/admin/generate-pre-intimation-docx", requireAdmin, async (req, res) => {
  try {
    const p        = buildIntimationParams(req.body);
    const logoPath = path.join(process.cwd(), "assets/images/hero-logo.png");
    const buf      = await buildIntimationDocx(p, false, logoPath);
    const filename = `Pre_Intimation_${p.customer_name.replace(/\s+/g, "_")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(buf);
  } catch (err: any) {
    console.error("[pre-intimation DOCX]", err);
    res.status(500).json({ message: err.message || "Failed to generate DOCX" });
  }
});

app.post("/api/admin/generate-post-intimation", requireAdmin, async (req, res) => {
  try {
    const p           = buildIntimationParams(req.body, true);
    const logoPath    = path.join(process.cwd(), "assets/images/hero-logo.png");
    const PDFDocument = require("pdfkit");
    const doc         = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 60, right: 60 }, info: { Title: "Post Repossession Intimation" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => {
      const filename = `Post_Intimation_${p.customer_name.replace(/\s+/g, "_")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.end(Buffer.concat(chunks));
    });
    buildPostIntimationPdf(doc, p, logoPath);
    doc.end();
  } catch (err: any) {
    console.error("[post-intimation PDF]", err);
    res.status(500).json({ message: err.message || "Failed to generate PDF" });
  }
});

app.post("/api/admin/generate-post-intimation-docx", requireAdmin, async (req, res) => {
  try {
    const p        = buildIntimationParams(req.body, true);
    const logoPath = path.join(process.cwd(), "assets/images/hero-logo.png");
    const buf      = await buildIntimationDocx(p, true, logoPath);
    const filename = `Post_Intimation_${p.customer_name.replace(/\s+/g, "_")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(buf);
  } catch (err: any) {
    console.error("[post-intimation DOCX]", err);
    res.status(500).json({ message: err.message || "Failed to generate DOCX" });
  }
});

  app.post("/api/cases/:id/extra-numbers", requireAuth, async (req, res) => {
  try {
    const { number, table } = req.body;
    const caseId = Number(req.params.id);
    const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
    if (!number?.trim()) return res.status(400).json({ message: "number required" });
    await storage.query(
      `UPDATE ${tbl} SET extra_numbers = array_append(COALESCE(extra_numbers, '{}'), $1) WHERE id = $2`,
      [number.trim(), caseId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/cases/:id/extra-numbers", requireAuth, async (req, res) => {
  try {
    const { number, table } = req.body;
    const caseId = Number(req.params.id);
    const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
    await storage.query(
      `UPDATE ${tbl} SET extra_numbers = array_remove(extra_numbers, $1) WHERE id = $2`,
      [number, caseId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/admin/cases/:id/extra-numbers", requireAdmin, async (req, res) => {
  try {
    const { number, table } = req.body;
    const caseId = Number(req.params.id);
    const tbl = table === "bkt" ? "bkt_cases" : "loan_cases";
    await storage.query(
      `UPDATE ${tbl} SET extra_numbers = array_remove(extra_numbers, $1) WHERE id = $2`,
      [number, caseId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  // ── DB migrations for receipt requests ────────────────────────────────────────
try {
  await storage.query(`ALTER TABLE fos_agents ADD COLUMN IF NOT EXISTS can_request_receipt BOOLEAN DEFAULT FALSE`);
  console.log("[DB] fos_agents.can_request_receipt column ready ✅");
} catch (e: any) { console.error("[DB] can_request_receipt migration:", e.message); }

try {
  await storage.query(`CREATE TABLE IF NOT EXISTS receipt_requests (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES fos_agents(id),
    case_id INTEGER,
    loan_no TEXT,
    customer_name TEXT,
    table_type TEXT DEFAULT 'loan',
    status TEXT DEFAULT 'pending',
    notes TEXT,
    emi_amount NUMERIC(12,2),
    cbc NUMERIC(12,2),
    lpp NUMERIC(12,2),
    requested_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
  )`);
  // Migration for existing tables
  await storage.query(`ALTER TABLE receipt_requests ADD COLUMN IF NOT EXISTS emi_amount NUMERIC(12,2)`);
  await storage.query(`ALTER TABLE receipt_requests ADD COLUMN IF NOT EXISTS cbc NUMERIC(12,2)`);
  await storage.query(`ALTER TABLE receipt_requests ADD COLUMN IF NOT EXISTS lpp NUMERIC(12,2)`);
  console.log("[DB] receipt_requests table ready ✅");
} catch (e: any) { console.error("[DB] receipt_requests error:", e.message); }

app.get("/api/receipt-permission", requireAuth, async (req, res) => {
  try {
    const result = await storage.query(
      `SELECT can_request_receipt FROM fos_agents WHERE id = $1`,
      [req.session.agentId!]
    );
    res.json({ canRequestReceipt: result.rows[0]?.can_request_receipt === true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ── FOS submits a receipt request ─────────────────────────────────────────────
app.post("/api/cases/:id/request-receipt", requireAuth, async (req, res) => {
  try {
    const agentId = req.session.agentId!;
    const caseId  = Number(req.params.id);
    const { loan_no, customer_name, table_type, notes, emi_amount, cbc, lpp } = req.body;

    // Verify this agent has the receipt permission
    const permRow = await storage.query(
      `SELECT can_request_receipt FROM fos_agents WHERE id = $1`, [agentId]
    );
    if (!permRow.rows[0]?.can_request_receipt) {
      return res.status(403).json({ message: "Receipt request not permitted for your account" });
    }

   // With this:
const existing = await storage.query(
  `SELECT id FROM receipt_requests WHERE agent_id=$1 AND case_id=$2 AND status='pending' AND requested_at > NOW() - INTERVAL '24 hours'`,
  [agentId, caseId]
);
if (existing.rows.length > 0) {
  return res.status(409).json({ message: "Already requested. Admin will process it shortly." });
}

   const result = await storage.query(
      `INSERT INTO receipt_requests (agent_id, case_id, loan_no, customer_name, table_type, notes, emi_amount, cbc, lpp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [agentId, caseId, loan_no || null, customer_name || null, table_type || "loan", notes || null,
       emi_amount || null, cbc || null, lpp || null]
    );

    // Notify all admins via push
    try {
      const agentRow  = await storage.query(`SELECT name FROM fos_agents WHERE id=$1`, [agentId]);
      const adminRows = await storage.query(
        `SELECT push_token FROM fos_agents WHERE role='admin' AND push_token IS NOT NULL AND push_token<>''`
      );
      const agentName = agentRow.rows[0]?.name || "FOS";
      for (const admin of adminRows.rows) {
        await sendPush(
          admin.push_token,
          "🧾 Receipt Request",
          `${agentName} requested a receipt for ${customer_name || loan_no || "a case"}.`,
          { screen: "receipt-requests", type: "receipt_request", caseId }
        );
      }
    } catch (pushErr: any) { console.error("[receipt-request] push error:", pushErr.message); }

    res.json({ success: true, request: result.rows[0] });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ── Admin: get all receipt requests ──────────────────────────────────────────
app.get("/api/admin/receipt-requests", requireAdmin, async (req, res) => {
  try {
    const result = await storage.query(`
      SELECT rr.*, fa.name AS agent_name, fa.push_token AS agent_push_token
      FROM receipt_requests rr
      LEFT JOIN fos_agents fa ON fa.id = rr.agent_id
      ORDER BY rr.requested_at DESC
    `);
    res.json({ requests: result.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ── Admin: resolve (approve/reject) a receipt request ────────────────────────
app.put("/api/admin/receipt-requests/:id/resolve", requireAdmin, async (req, res) => {
  try {
    const id     = Number(req.params.id);
    const { status, notes } = req.body; // status: 'approved' | 'rejected'

    const reqRow = await storage.query(
      `UPDATE receipt_requests SET status=$1, notes=COALESCE($2, notes), resolved_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, notes || null, id]
    );
    const request = reqRow.rows[0];
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Notify the FOS agent
    if (request.agent_push_token || request.agent_id) {
      const agentRow = await storage.query(
        `SELECT push_token, name FROM fos_agents WHERE id=$1`, [request.agent_id]
      );
      const agent = agentRow.rows[0];
      if (agent?.push_token) {
        await sendPush(
          agent.push_token,
          status === "approved" ? "✅ Receipt Approved" : "❌ Receipt Request Rejected",
          status === "approved"
            ? `Your receipt request for ${request.customer_name || request.loan_no} was approved.`
            : `Your receipt request for ${request.customer_name || request.loan_no} was declined.`,
          { screen: "receipt-requests", type: "receipt_resolved", status }
        );
      }
    }

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ── Admin: toggle receipt permission for a FOS agent ─────────────────────────
app.put("/api/admin/agents/:agentId/receipt-permission", requireAdmin, async (req, res) => {
  try {
    const agentId = Number(req.params.agentId);
    const { enabled } = req.body;
    await storage.query(
      `UPDATE fos_agents SET can_request_receipt=$1 WHERE id=$2`,
      [!!enabled, agentId]
    );

    // Notify the agent
    const agentRow = await storage.query(
      `SELECT name, push_token FROM fos_agents WHERE id=$1`, [agentId]
    );
    const agent = agentRow.rows[0];
    if (agent?.push_token && enabled) {
      await sendPush(
        agent.push_token,
        "🧾 Receipt Feature Enabled",
        "Admin enabled receipt request for your account. You can now request receipts.",
        { screen: "allocation", type: "receipt_permission" }
      );
    }

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ── FOS: get own receipt requests (for status tracking) ──────────────────────
app.get("/api/receipt-requests", requireAuth, async (req, res) => {
  try {
    const result = await storage.query(
      `SELECT * FROM receipt_requests WHERE agent_id=$1 ORDER BY requested_at DESC LIMIT 50`,
      [req.session.agentId!]
    );
    res.json({ requests: result.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

  // ── Auto-create field_visits table ──────────────────────────────────────────
  try {
    await storage.query(`
      CREATE TABLE IF NOT EXISTS field_visits (
        id          SERIAL PRIMARY KEY,
        case_id     INTEGER NOT NULL,
        case_type   TEXT    NOT NULL DEFAULT 'loan',
        agent_id    INTEGER REFERENCES fos_agents(id) ON DELETE SET NULL,
        lat         NUMERIC(11, 7) NOT NULL,
        lng         NUMERIC(11, 7) NOT NULL,
        accuracy    NUMERIC(8, 2),
        visited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[DB] field_visits table ready ✅");
  } catch (e) {
    console.error("[field_visits] Table creation error:", e);
  }

  // ── Migrate field_visits: add case_type column if missing ───────────────────
  try {
    await storage.query(`
      ALTER TABLE field_visits
        ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT 'loan'
    `);
    console.log("[DB] field_visits.case_type column ensured ✅");
  } catch (e) {
    console.error("[field_visits] Migration error (case_type):", e);
  }

  try {
  await storage.query(`ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS photo_url TEXT`);
  console.log("[DB] field_visits.photo_url column ready ✅");
} catch (e: any) { console.error("[DB] field_visits.photo_url migration:", e.message); }
  try {
    await storage.query(`ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS lat NUMERIC(11, 7)`);
    await storage.query(`ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS lng NUMERIC(11, 7)`);
    await storage.query(`ALTER TABLE field_visits ADD COLUMN IF NOT EXISTS accuracy NUMERIC(8, 2)`);
    console.log("[DB] field_visits lat/lng/accuracy columns ensured ✅");
  } catch (e) {
    console.error("[field_visits] Migration error (lat/lng):", e);
  }

  try {
    const dropNotNulls = [
      `ALTER TABLE field_visits ALTER COLUMN outcome DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN latitude DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN longitude DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN customer_name DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN loan_no DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN remarks DROP NOT NULL`,
      `ALTER TABLE field_visits ALTER COLUMN status DROP NOT NULL`,
    ];
    for (const sql of dropNotNulls) {
      try { await storage.query(sql); } catch {}
    }
    console.log("[DB] field_visits all NOT NULL constraints dropped ✅");
  } catch (e: any) { console.error("[DB] field_visits constraint migration:", e.message); }
  

// ── POST /api/cases/:id/visit — agent records a geo check-in ────────────────

 
app.post(
  "/api/cases/:id/visit",
  requireAuth,
  upload.single("photo"),   // memory storage — buffer stored as base64 in DB, survives Railway restarts
  async (req: Request, res: Response) => {
    try {
      const caseId  = Number(req.params.id);
      const agentId = req.session.agentId!;

      const lat       = Number(req.body.lat);
      const lng       = Number(req.body.lng);
      const accuracy  = req.body.accuracy ? Number(req.body.accuracy) : null;
      const case_type = req.body.case_type || "loan";

      if (!lat || !lng) {
        return res.status(400).json({ message: "lat and lng are required" });
      }

      // Store photo as base64 data URL directly in PostgreSQL so it is never
      // lost when the Railway container restarts (ephemeral filesystem).
      let photoUrl: string | null = null;
      if (req.file) {
        const mime = req.file.mimetype || "image/jpeg";
        photoUrl = `data:${mime};base64,${req.file.buffer.toString("base64")}`;
      }

      const result = await storage.query(
        `INSERT INTO field_visits (case_id, case_type, agent_id, lat, lng, accuracy, photo_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [caseId, case_type, agentId, lat, lng, accuracy, photoUrl]
      );

      res.json({ visit: result.rows[0] });
    } catch (e: any) {
      console.error("[POST /api/cases/:id/visit]", e);
      res.status(500).json({ message: e.message });
    }
  }
);
// ── GET /api/cases/:id/visits — agent fetches their own visit history ─────────
app.get("/api/cases/:id/visits", requireAuth, async (req: Request, res: Response) => {
  try {
    const caseId  = Number(req.params.id);
    const agentId = req.session.agentId!;
    const result  = await storage.query(
      `SELECT id, case_id, case_type, agent_id, lat, lng, accuracy, visited_at,
              (photo_url IS NOT NULL AND photo_url <> '') AS has_photo
       FROM field_visits
       WHERE case_id = $1 AND agent_id = $2
       ORDER BY visited_at DESC
       LIMIT 50`,
      [caseId, agentId]
    );
    res.json({ visits: result.rows });
  } catch (e: any) {
    console.error("[GET /api/cases/:id/visits]", e);
    res.status(500).json({ message: e.message });
  }
});

// ── GET /api/field-visits/:id/photo — serve visit photo as image ────────────
// Accepts auth via: session cookie, Authorization header, OR ?token= query param
// (React Native <Image> cannot set headers, so query param is needed)
app.get("/api/field-visits/:id/photo", async (req: Request, res: Response) => {
  try {
    // Auth check: session, Bearer header, or ?token= query param
    let authed = false;
    if (req.session.agentId) {
      authed = true;
    } else {
      const authHeader = req.headers.authorization;
      const queryToken = req.query.token as string | undefined;
      const rawToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : queryToken;
      if (rawToken) {
        const payload = verifyToken(rawToken);
        if (payload) authed = true;
      }
    }
    if (!authed) return res.status(401).json({ message: "Unauthorized" });

    const visitId = Number(req.params.id);
    const result = await storage.query(
      `SELECT photo_url FROM field_visits WHERE id = $1`,
      [visitId]
    );
    const row = result.rows[0];
    if (!row || !row.photo_url) {
      return res.status(404).json({ message: "No photo found" });
    }
    const dataUrl: string = row.photo_url;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
      return res.status(500).json({ message: "Invalid photo format" });
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (e: any) {
    console.error("[GET /api/field-visits/:id/photo]", e);
    res.status(500).json({ message: e.message });
  }
});

// ── GET /api/admin/field-visits — admin sees all visits with filters ─────────
// ── GET /api/admin/debug-photos — check photo_url status for recent visits ──
app.get("/api/admin/debug-photos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await storage.query(`
      SELECT id, agent_id, visited_at,
        CASE WHEN photo_url IS NULL THEN 'NULL'
             WHEN photo_url = '' THEN 'EMPTY'
             ELSE 'HAS_PHOTO (' || LENGTH(photo_url)::text || ' chars)'
        END AS photo_status
      FROM field_visits
      ORDER BY visited_at DESC
      LIMIT 20
    `);
    res.json({ visits: result.rows });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/field-visits", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agent_id, case_id, date } = req.query;

    let sql = `
      SELECT
        fv.id, fv.case_id, fv.case_type, fv.agent_id, fv.lat, fv.lng,
        fv.accuracy, fv.visited_at,
        (fv.photo_url IS NOT NULL AND fv.photo_url <> '') AS has_photo,
        fa.name AS agent_name,
        CASE
          WHEN LOWER(TRIM(fv.case_type)) = 'bkt'
          THEN bc.customer_name
          ELSE lc.customer_name
        END AS customer_name,
        CASE
          WHEN LOWER(TRIM(fv.case_type)) = 'bkt'
          THEN bc.loan_no
          ELSE lc.loan_no
        END AS loan_no,
        CASE
          WHEN LOWER(TRIM(fv.case_type)) = 'bkt'
          THEN bc.pos::numeric
          ELSE lc.pos::numeric
        END AS pos,
        CASE
          WHEN LOWER(TRIM(fv.case_type)) = 'bkt'
          THEN bc.latest_feedback
          ELSE lc.latest_feedback
        END AS latest_feedback,
        CASE
          WHEN LOWER(TRIM(fv.case_type)) = 'bkt'
          THEN bc.status
          ELSE lc.status
        END AS case_status
      FROM field_visits fv
      LEFT JOIN fos_agents fa  ON fa.id  = fv.agent_id::integer
      LEFT JOIN loan_cases lc  ON lc.id  = fv.case_id::integer
      LEFT JOIN bkt_cases  bc  ON bc.id  = fv.case_id::integer
      WHERE 1=1
    `;
    const params: any[] = [];

    if (agent_id) {
      params.push(Number(agent_id));
      sql += ` AND fv.agent_id::integer = $${params.length}`;
    }
    if (case_id) {
      params.push(Number(case_id));
      sql += ` AND fv.case_id::integer = $${params.length}`;
    }
    if (date) {
      params.push(String(date));
      sql += ` AND DATE(fv.visited_at AT TIME ZONE 'Asia/Kolkata') = $${params.length}::date`;
    }

    sql += " ORDER BY fv.visited_at DESC LIMIT 200";

    const result = await storage.query(sql, params);

    // Debug: log has_photo status for each visit
    const photoSummary = result.rows.map((r: any) => ({ id: r.id, has_photo: r.has_photo, visited_at: r.visited_at }));
    console.log("[field-visits] has_photo summary:", JSON.stringify(photoSummary));

    res.json({ visits: result.rows });
  } catch (e: any) {
    console.error("[GET /api/admin/field-visits]", e);
    res.status(500).json({ message: e.message });
  }
});
 
  // ── Case Reassign ────────────────────────────────────────────────────────────
 
  // ── Auto-create case_reassign_log table ─────────────────────────────────────
  try {
    await storage.query(`
      CREATE TABLE IF NOT EXISTS case_reassign_log (
        id              SERIAL PRIMARY KEY,
        case_id         INTEGER NOT NULL,
        case_type       TEXT    NOT NULL DEFAULT 'loan',
        from_agent_id   INTEGER REFERENCES fos_agents(id) ON DELETE SET NULL,
        to_agent_id     INTEGER NOT NULL REFERENCES fos_agents(id) ON DELETE CASCADE,
        reason          TEXT,
        reassigned_by   INTEGER NOT NULL REFERENCES fos_agents(id),
        reassigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("[DB] case_reassign_log table ready ✅");
  } catch (e) {
    console.error("[case_reassign_log] Table creation error:", e);
  }
 
// ── PATCH /api/admin/cases/:id/reassign ─────────────────────────────────────
app.patch("/api/admin/cases/:id/reassign", requireAdmin, async (req: Request, res: Response) => {
  try {
    const caseId        = Number(req.params.id);
    const adminId       = req.session.agentId!;
    const { to_agent_id, case_type = "loan", reason } = req.body as {
      to_agent_id: number; case_type?: string; reason?: string;
    };
 
    if (!to_agent_id) {
      return res.status(400).json({ message: "to_agent_id is required" });
    }
 
    // 1. Fetch current agent for the log
    const table = case_type === "bkt" ? "bkt_cases" : "loan_cases";
    const current = await storage.query(
      `SELECT agent_id FROM ${table} WHERE id = $1`,
      [caseId]
    );
    if (!current.rows.length) {
      return res.status(404).json({ message: "Case not found" });
    }
    const fromAgentId: number | null = current.rows[0].agent_id ?? null;
 
    // 2. Update agent_id on the case
    await storage.query(
      `UPDATE ${table} SET agent_id = $1 WHERE id = $2`,
      [to_agent_id, caseId]
    );
 
    // 3. Write audit log
    await storage.query(
      `INSERT INTO case_reassign_log
         (case_id, case_type, from_agent_id, to_agent_id, reason, reassigned_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [caseId, case_type, fromAgentId, to_agent_id, reason ?? null, adminId]
    );
 
    res.json({ success: true, case_id: caseId, to_agent_id });
  } catch (e: any) {
    console.error("[PATCH /api/admin/cases/:id/reassign]", e);
    res.status(500).json({ message: e.message });
  }
});
 
// ── GET /api/admin/cases/:id/reassign-log — audit trail for one case ─────────
app.get("/api/admin/cases/:id/reassign-log", requireAdmin, async (req: Request, res: Response) => {
  try {
    const caseId = Number(req.params.id);
    const result = await storage.query(
      `SELECT crl.*,
              f.name AS from_agent_name,
              t.name AS to_agent_name,
              r.name AS reassigned_by_name
       FROM   case_reassign_log crl
       LEFT JOIN fos_agents f ON f.id = crl.from_agent_id
       LEFT JOIN fos_agents t ON t.id = crl.to_agent_id
       LEFT JOIN fos_agents r ON r.id = crl.reassigned_by
       WHERE  crl.case_id = $1
       ORDER  BY crl.reassigned_at DESC`,
      [caseId]
    );
    res.json({ log: result.rows });
  } catch (e: any) {
    console.error("[GET /api/admin/cases/:id/reassign-log]", e);
    res.status(500).json({ message: e.message });
  }
});
  
const httpServer = createServer(app);
return httpServer;
}
