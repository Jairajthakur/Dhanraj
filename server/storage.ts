import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(sql: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

export async function initDatabase() {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS fos_agents (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'fos',
      phone      TEXT,
      photo_url  TEXT,
      push_token TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      sid    VARCHAR NOT NULL PRIMARY KEY,
      sess   JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions(expire)`,
    `CREATE TABLE IF NOT EXISTS loan_cases (
      id                  SERIAL PRIMARY KEY,
      agent_id            INTEGER REFERENCES fos_agents(id),
      fos_name            TEXT,
      loan_no             TEXT NOT NULL UNIQUE,
      customer_name       TEXT NOT NULL,
      bkt                 INTEGER,
      app_id              TEXT,
      address             TEXT,
      mobile_no           TEXT,
      reference_address   TEXT,
      pos                 NUMERIC,
      asset_make          TEXT,
      registration_no     TEXT,
      engine_no           TEXT,
      chassis_no          TEXT,
      emi_amount          NUMERIC,
      emi_due             NUMERIC,
      cbc                 NUMERIC,
      lpp                 NUMERIC,
      cbc_lpp             NUMERIC,
      rollback            NUMERIC,
      clearance           NUMERIC,
      first_emi_due_date  DATE,
      loan_maturity_date  DATE,
      tenor               INTEGER,
      pro                 TEXT,
      status              TEXT DEFAULT 'Unpaid',
      latest_feedback     TEXT,
      feedback_comments   TEXT,
      feedback_date       TIMESTAMPTZ,
      ptp_date            DATE,
      telecaller_ptp_date DATE,
      rollback_yn         BOOLEAN,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_loan_cases_agent  ON loan_cases(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_loan_cases_status ON loan_cases(status)`,
    `CREATE TABLE IF NOT EXISTS bkt_cases (
      id                  SERIAL PRIMARY KEY,
      case_category       TEXT NOT NULL,
      agent_id            INTEGER REFERENCES fos_agents(id),
      fos_name            TEXT,
      customer_name       TEXT NOT NULL,
      loan_no             TEXT NOT NULL UNIQUE,
      bkt                 INTEGER,
      app_id              TEXT,
      address             TEXT,
      mobile_no           TEXT,
      ref1_name           TEXT,
      ref1_mobile         TEXT,
      ref2_name           TEXT,
      ref2_mobile         TEXT,
      reference_address   TEXT,
      pos                 NUMERIC,
      asset_name          TEXT,
      asset_make          TEXT,
      registration_no     TEXT,
      engine_no           TEXT,
      chassis_no          TEXT,
      emi_amount          NUMERIC,
      emi_due             NUMERIC,
      cbc                 NUMERIC,
      lpp                 NUMERIC,
      cbc_lpp             NUMERIC,
      rollback            NUMERIC,
      clearance           NUMERIC,
      first_emi_due_date  DATE,
      loan_maturity_date  DATE,
      tenor               INTEGER,
      pro                 TEXT,
      status              TEXT DEFAULT 'Unpaid',
      latest_feedback     TEXT,
      feedback_comments   TEXT,
      feedback_date       TIMESTAMPTZ,
      ptp_date            DATE,
      telecaller_ptp_date DATE,
      rollback_yn         BOOLEAN,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bkt_cases_agent    ON bkt_cases(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bkt_cases_category ON bkt_cases(case_category)`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id        SERIAL PRIMARY KEY,
      agent_id  INTEGER NOT NULL REFERENCES fos_agents(id),
      date      DATE NOT NULL,
      check_in  TIMESTAMPTZ,
      check_out TIMESTAMPTZ,
      UNIQUE(agent_id, date)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_agent ON attendance(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_date  ON attendance(date)`,
    `CREATE TABLE IF NOT EXISTS salary_details (
      id               SERIAL PRIMARY KEY,
      agent_id         INTEGER NOT NULL REFERENCES fos_agents(id),
      month            INTEGER NOT NULL,
      year             INTEGER NOT NULL,
      present_days     INTEGER DEFAULT 0,
      payment_amount   NUMERIC DEFAULT 0,
      incentive_amount NUMERIC DEFAULT 0,
      petrol_expense   NUMERIC DEFAULT 0,
      mobile_expense   NUMERIC DEFAULT 0,
      gross_payment    NUMERIC DEFAULT 0,
      advance          NUMERIC DEFAULT 0,
      other_deductions NUMERIC DEFAULT 0,
      total            NUMERIC DEFAULT 0,
      net_salary       NUMERIC DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_salary_agent ON salary_details(agent_id)`,
    `CREATE TABLE IF NOT EXISTS depositions (
      id              SERIAL PRIMARY KEY,
      agent_id        INTEGER NOT NULL REFERENCES fos_agents(id),
      loan_case_id    INTEGER REFERENCES loan_cases(id),
      amount          NUMERIC NOT NULL,
      deposition_date DATE,
      receipt_no      TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_depositions_agent ON depositions(agent_id)`,
    `CREATE TABLE IF NOT EXISTS required_deposits (
      id                     SERIAL PRIMARY KEY,
      agent_id               INTEGER NOT NULL REFERENCES fos_agents(id),
      amount                 NUMERIC NOT NULL,
      description            TEXT,
      due_date               DATE,
      screenshot_url         TEXT,
      screenshot_uploaded_at TIMESTAMPTZ,
      alarm_scheduled        BOOLEAN DEFAULT FALSE,
      reminder_sent          BOOLEAN DEFAULT FALSE,
      created_at             TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_required_deposits_agent ON required_deposits(agent_id)`,
    `CREATE TABLE IF NOT EXISTS bkt_perf_summary (
      id                   SERIAL PRIMARY KEY,
      fos_name             TEXT NOT NULL,
      agent_id             INTEGER REFERENCES fos_agents(id),
      bkt                  TEXT NOT NULL,
      pos_paid             NUMERIC DEFAULT 0,
      pos_unpaid           NUMERIC DEFAULT 0,
      pos_grand_total      NUMERIC DEFAULT 0,
      pos_percentage       NUMERIC DEFAULT 0,
      count_paid           INTEGER DEFAULT 0,
      count_unpaid         INTEGER DEFAULT 0,
      count_total          INTEGER DEFAULT 0,
      rollback_paid        NUMERIC DEFAULT 0,
      rollback_unpaid      NUMERIC DEFAULT 0,
      rollback_grand_total NUMERIC DEFAULT 0,
      rollback_percentage  NUMERIC DEFAULT 0,
      uploaded_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(fos_name, bkt)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bkt_perf_agent ON bkt_perf_summary(agent_id)`,

    // ── Column migrations ──
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS pos_paid             NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS pos_unpaid           NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS pos_grand_total      NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS pos_percentage       NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS count_paid           INTEGER DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS count_unpaid         INTEGER DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS count_total          INTEGER DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS rollback_paid        NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS rollback_unpaid      NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS rollback_grand_total NUMERIC DEFAULT 0`,
    `ALTER TABLE bkt_perf_summary ADD COLUMN IF NOT EXISTS rollback_percentage  NUMERIC DEFAULT 0`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS telecaller_ptp_date DATE`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS telecaller_ptp_date DATE`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS customer_available BOOLEAN`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS vehicle_available  BOOLEAN`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS third_party        BOOLEAN`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS third_party_name   TEXT`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS third_party_number TEXT`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS feedback_code      TEXT`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS projection         TEXT`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS non_starter        BOOLEAN`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS kyc_purchase       BOOLEAN`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS workable           BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS customer_available BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS vehicle_available  BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS third_party        BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS third_party_name   TEXT`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS third_party_number TEXT`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS feedback_code      TEXT`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS projection         TEXT`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS non_starter        BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS kyc_purchase       BOOLEAN`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS workable           BOOLEAN`,
    `ALTER TABLE fos_agents ADD COLUMN IF NOT EXISTS phone      TEXT`,
    `ALTER TABLE fos_agents ADD COLUMN IF NOT EXISTS photo_url  TEXT`,
    `ALTER TABLE fos_agents ADD COLUMN IF NOT EXISTS push_token TEXT`,
    // ✅ NEW: monthly_feedback
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS monthly_feedback TEXT`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS monthly_feedback TEXT`,
    `ALTER TABLE loan_cases ADD COLUMN IF NOT EXISTS extra_numbers TEXT[] DEFAULT '{}'`,
    `ALTER TABLE bkt_cases  ADD COLUMN IF NOT EXISTS extra_numbers TEXT[] DEFAULT '{}'`,
    // ✅ NEW: call_logs history table
    `CREATE TABLE IF NOT EXISTS call_logs (
      id           SERIAL PRIMARY KEY,
      case_id      INTEGER NOT NULL,
      case_type    TEXT NOT NULL DEFAULT 'loan',
      agent_id     INTEGER REFERENCES fos_agents(id),
      loan_no      TEXT,
      customer_name TEXT,
      outcome      TEXT,
      comments     TEXT,
      ptp_date     DATE,
      status       TEXT,
      logged_at    TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_call_logs_case    ON call_logs(case_id, case_type)`,
    `CREATE INDEX IF NOT EXISTS idx_call_logs_agent   ON call_logs(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_call_logs_logged  ON call_logs(logged_at DESC)`,
    // Normalize bkt
    `UPDATE bkt_perf_summary SET bkt = 'bkt1'  WHERE LOWER(REPLACE(bkt,' ','')) IN ('1','bkt1')  AND bkt <> 'bkt1'`,
    `UPDATE bkt_perf_summary SET bkt = 'bkt2'  WHERE LOWER(REPLACE(bkt,' ','')) IN ('2','bkt2')  AND bkt <> 'bkt2'`,
    `UPDATE bkt_perf_summary SET bkt = 'bkt3'  WHERE LOWER(REPLACE(bkt,' ','')) IN ('3','bkt3')  AND bkt <> 'bkt3'`,
    `UPDATE bkt_perf_summary SET bkt = 'penal' WHERE LOWER(bkt) = 'penal'                        AND bkt <> 'penal'`,

    `INSERT INTO fos_agents (name, username, password, role)
     VALUES ('Admin', 'admin', 'admin123', 'admin')
     ON CONFLICT (username) DO NOTHING`,
  ];

  for (const sql of migrations) {
    try { await query(sql); }
    catch (e: any) { console.warn(`[migration] skipped: ${e.message?.slice(0, 80)}`); }
  }
  console.log("[migration] Database initialized successfully");
}

export async function initBktPerfSummaryTable() {
  await initDatabase();
}

export async function getAgentByUsername(username: string) {
  const result = await query("SELECT * FROM fos_agents WHERE username = $1", [username]);
  return result.rows[0] || null;
}

export async function getAgentById(id: number) {
  const result = await query("SELECT * FROM fos_agents WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getAllAgents() {
  const result = await query("SELECT * FROM fos_agents WHERE role = 'fos' ORDER BY name");
  return result.rows;
}

export async function getAllAgentsWithAdmin() {
  const result = await query("SELECT * FROM fos_agents ORDER BY name");
  return result.rows;
}

export async function createFosAgent(data: { name: string; username: string; password: string }) {
  const result = await query(
    `INSERT INTO fos_agents (name, username, password, role)
     VALUES ($1, $2, $3, 'fos')
     ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [data.name, data.username, data.password]
  );
  return result.rows[0];
}

export async function deleteAllLoanCases() { await query("DELETE FROM loan_cases"); }
export async function deleteAllBktCases() { await query("DELETE FROM bkt_cases"); }

export async function getLoanCasesByAgent(agentId: number, companyName?: string | null) {
  if (companyName && companyName !== "All") {
    const result = await query(
      "SELECT * FROM loan_cases WHERE agent_id = $1 AND company_name = $2 ORDER BY bkt DESC NULLS LAST, customer_name",
      [agentId, companyName]
    );
    return result.rows;
  }
  const result = await query(
    "SELECT * FROM loan_cases WHERE agent_id = $1 ORDER BY bkt DESC NULLS LAST, customer_name",
    [agentId]
  );
  return result.rows;
}

export async function getDistinctCompaniesByAgent(agentId: number): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT company_name FROM (
       SELECT company_name FROM loan_cases WHERE agent_id = $1 AND company_name IS NOT NULL AND company_name != ''
       UNION
       SELECT company_name FROM bkt_cases WHERE agent_id = $1 AND company_name IS NOT NULL AND company_name != ''
     ) t ORDER BY company_name`,
    [agentId]
  );
  return result.rows.map((r: any) => r.company_name);
}

export async function getAllLoanCases() {
  const result = await query(
    `SELECT lc.*, fa.name as agent_name FROM loan_cases lc
     LEFT JOIN fos_agents fa ON lc.agent_id = fa.id
     ORDER BY fa.name, lc.bkt DESC NULLS LAST`
  );
  return result.rows;
}

export async function getLoanCaseById(id: number) {
  const result = await query("SELECT * FROM loan_cases WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export interface FeedbackExtra {
  customerAvailable?: boolean | null;
  vehicleAvailable?: boolean | null;
  thirdParty?: boolean | null;
  thirdPartyName?: string | null;
  thirdPartyNumber?: string | null;
  feedbackCode?: string | null;
  projection?: string | null;
  nonStarter?: boolean | null;
  kycPurchase?: boolean | null;
  workable?: boolean | null;
  monthlyFeedback?: string | null; // ✅ NEW
   ptpDateMf?: string | null;
  shiftedCity?: string | null;
  occupation?: string | null;
}

// ✅ UPDATED: $17 = monthly_feedback
export async function updateLoanCaseFeedback(
  id: number,
  status: string,
  feedback: string,
  comments: string,
  ptpDate?: string | null,
  rollbackYn?: boolean | null,
  extra?: FeedbackExtra
) {
  await query(
    `UPDATE loan_cases SET
       status             = $1,
       latest_feedback    = $2,
       feedback_comments  = $3,
       feedback_date      = NOW(),
       ptp_date           = $5,
       rollback_yn        = COALESCE($6,  rollback_yn),
       customer_available = COALESCE($7,  customer_available),
       vehicle_available  = COALESCE($8,  vehicle_available),
       third_party        = COALESCE($9,  third_party),
       third_party_name   = COALESCE($10, third_party_name),
       third_party_number = COALESCE($11, third_party_number),
       feedback_code      = COALESCE(NULLIF($12,''), feedback_code),
       projection         = COALESCE(NULLIF($13,''), projection),
       non_starter        = COALESCE($14, non_starter),
       kyc_purchase       = COALESCE($15, kyc_purchase),
       workable           = COALESCE($16, workable),
       monthly_feedback   = COALESCE(NULLIF($17,''), monthly_feedback),
       ptp_date_mf        = COALESCE($18, ptp_date_mf),
       shifted_city       = COALESCE(NULLIF($19,''), shifted_city),
       occupation         = COALESCE(NULLIF($20,''), occupation)
     WHERE id = $4`,
    [
      status, feedback, comments, id,
      ptpDate || null,
      rollbackYn != null ? rollbackYn : null,
      extra?.customerAvailable   ?? null,
      extra?.vehicleAvailable    ?? null,
      extra?.thirdParty          ?? null,
      extra?.thirdPartyName      ?? null,
      extra?.thirdPartyNumber    ?? null,
      extra?.feedbackCode        ?? null,
      extra?.projection          ?? null,
      extra?.nonStarter          ?? null,
      extra?.kycPurchase         ?? null,
      extra?.workable            ?? null,
      extra?.monthlyFeedback     ?? null,  // ✅ $17
       extra?.ptpDateMf           ?? null,  // $18
      extra?.shiftedCity         ?? null,  // $19
      extra?.occupation          ?? null,  // $20
    ]
  );
}

export async function getTodayAttendance(agentId: number) {
  const result = await query(
    "SELECT * FROM attendance WHERE agent_id = $1 AND date = CURRENT_DATE", [agentId]
  );
  return result.rows[0] || null;
}

export async function checkIn(agentId: number) {
  const existing = await getTodayAttendance(agentId);
  if (existing) {
    await query("UPDATE attendance SET check_in = NOW() WHERE agent_id = $1 AND date = CURRENT_DATE", [agentId]);
  } else {
    await query("INSERT INTO attendance (agent_id, date, check_in) VALUES ($1, CURRENT_DATE, NOW())", [agentId]);
  }
}

export async function checkOut(agentId: number) {
  const existing = await getTodayAttendance(agentId);
  if (existing) {
    await query("UPDATE attendance SET check_out = NOW() WHERE agent_id = $1 AND date = CURRENT_DATE", [agentId]);
  } else {
    await query("INSERT INTO attendance (agent_id, date, check_out) VALUES ($1, CURRENT_DATE, NOW())", [agentId]);
  }
}

export async function getAllAttendance() {
  const result = await query(
    `SELECT a.*, fa.name as agent_name FROM attendance a
     LEFT JOIN fos_agents fa ON a.agent_id = fa.id
     ORDER BY a.date DESC, fa.name`
  );
  return result.rows;
}

export async function getSalaryDetails(agentId: number) {
  const result = await query(
    "SELECT * FROM salary_details WHERE agent_id = $1 ORDER BY year DESC, created_at DESC", [agentId]
  );
  return result.rows;
}

export async function getAllSalaryDetails() {
  const result = await query(
    `SELECT sd.*, fa.name as agent_name FROM salary_details sd
     LEFT JOIN fos_agents fa ON sd.agent_id = fa.id
     ORDER BY fa.name, sd.year DESC`
  );
  return result.rows;
}

export async function createSalary(data: any) {
  await query(
    `INSERT INTO salary_details (agent_id, month, year, present_days, payment_amount, incentive_amount, petrol_expense, mobile_expense, gross_payment, advance, other_deductions, total, net_salary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [data.agentId, data.month, data.year, data.presentDays, data.paymentAmount, data.incentiveAmount,
     data.petrolExpense, data.mobileExpense, data.grossPayment, data.advance, data.otherDeductions, data.total, data.netSalary]
  );
}

export async function getDepositions(agentId: number) {
  const result = await query(
    `SELECT d.*, lc.customer_name, lc.loan_no, lc.bkt FROM depositions d
     LEFT JOIN loan_cases lc ON d.loan_case_id = lc.id
     WHERE d.agent_id = $1 ORDER BY d.deposition_date DESC`, [agentId]
  );
  return result.rows;
}

export async function getAllDepositions() {
  const result = await query(
    `SELECT d.*, lc.customer_name, lc.loan_no, lc.bkt, fa.name as agent_name
     FROM depositions d
     LEFT JOIN loan_cases lc ON d.loan_case_id = lc.id
     LEFT JOIN fos_agents fa ON d.agent_id = fa.id
     ORDER BY d.deposition_date DESC`
  );
  return result.rows;
}

export async function createDeposition(data: any) {
  await query(
    `INSERT INTO depositions (agent_id, loan_case_id, amount, deposition_date, receipt_no, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.agentId, data.loanCaseId, data.amount, data.depositionDate, data.receiptNo, data.notes]
  );
}

export async function updateAgentPassword(agentId: number, newPassword: string) {
  await query("UPDATE fos_agents SET password = $1 WHERE id = $2", [newPassword, agentId]);
}

export async function getAgentStats(agentId: number) {
  const cases = await getLoanCasesByAgent(agentId);
  const total = cases.length;
  const paid = cases.filter((c: any) => c.status === "Paid").length;
  const notProcess = cases.filter((c: any) => c.status === "Unpaid").length;
  const today = new Date().toISOString().split("T")[0];
  const ptp = cases.filter((c: any) => c.status === "PTP").length;
  const todayCollections = cases.filter((c: any) => {
    if (c.status !== "Paid" || !c.feedback_date) return false;
    return String(c.feedback_date).startsWith(today);
  });
  return { total, paid, notProcess, ptp, todayCollections };
}

export async function getAllAgentStats() {
  const result = await query(
    `SELECT fa.id, fa.name, fa.username, fa.role,
       COUNT(lc.id)::int                                      AS total,
       COUNT(lc.id) FILTER (WHERE lc.status='Paid')::int     AS paid,
       COUNT(lc.id) FILTER (WHERE lc.status='Unpaid')::int   AS "notProcess",
       COUNT(lc.id) FILTER (WHERE lc.status='PTP')::int      AS ptp
     FROM fos_agents fa
     LEFT JOIN loan_cases lc ON lc.agent_id = fa.id
     WHERE fa.role = 'fos'
     GROUP BY fa.id, fa.name, fa.username, fa.role
     ORDER BY fa.name`
  );
  return result.rows;
}

export async function createLoanCase(data: any) {
  await query(
    `INSERT INTO loan_cases (agent_id, customer_name, loan_no, bkt, app_id, address, mobile_no, pos, emi_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [data.agentId, data.customerName, data.loanNo, data.bkt, data.appId, data.address, data.mobileNo, data.pos, data.emiAmount]
  );
}

export async function upsertLoanCase(data: {
  agentId: number | null; fosName?: string | null; loanNo: string; customerName: string;
  bkt?: number | null; appId?: string | null; address?: string | null; mobileNo?: string | null;
  referenceAddress?: string | null; pos?: string | null; assetMake?: string | null;
  registrationNo?: string | null; engineNo?: string | null; chassisNo?: string | null;
  emiAmount?: string | null; emiDue?: string | null; cbc?: string | null; lpp?: string | null;
  cbcLpp?: string | null; rollback?: string | null; clearance?: string | null;
  firstEmiDueDate?: string | null; loanMaturityDate?: string | null; tenor?: number | null;
  pro?: string | null; status?: string | null; latestFeedback?: string | null;
  feedbackComments?: string | null; ptpDate?: string | null; telecallerPtpDate?: string | null;
  rollbackYn?: boolean | null; companyName?: string | null;
}): Promise<"inserted" | "updated"> {
  const result = await query(
    `INSERT INTO loan_cases (
      agent_id, fos_name, loan_no, customer_name, bkt, app_id, address, mobile_no,
      reference_address, pos, asset_make, registration_no, engine_no, chassis_no,
      emi_amount, emi_due, cbc, lpp, cbc_lpp, rollback, clearance,
      first_emi_due_date, loan_maturity_date, tenor, pro, status,
      latest_feedback, feedback_comments, ptp_date, telecaller_ptp_date, rollback_yn,
      company_name
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
      $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,
      $32
    )
    ON CONFLICT (loan_no) DO UPDATE SET
      agent_id = EXCLUDED.agent_id, fos_name = EXCLUDED.fos_name,
      customer_name = EXCLUDED.customer_name,
      bkt = COALESCE(EXCLUDED.bkt, loan_cases.bkt),
      app_id = COALESCE(EXCLUDED.app_id, loan_cases.app_id),
      address = COALESCE(EXCLUDED.address, loan_cases.address),
      mobile_no = COALESCE(EXCLUDED.mobile_no, loan_cases.mobile_no),
      reference_address = COALESCE(EXCLUDED.reference_address, loan_cases.reference_address),
      pos = COALESCE(EXCLUDED.pos, loan_cases.pos),
      asset_make = COALESCE(EXCLUDED.asset_make, loan_cases.asset_make),
      registration_no = COALESCE(EXCLUDED.registration_no, loan_cases.registration_no),
      engine_no = COALESCE(EXCLUDED.engine_no, loan_cases.engine_no),
      chassis_no = COALESCE(EXCLUDED.chassis_no, loan_cases.chassis_no),
      emi_amount = COALESCE(EXCLUDED.emi_amount, loan_cases.emi_amount),
      emi_due = COALESCE(EXCLUDED.emi_due, loan_cases.emi_due),
      cbc = COALESCE(EXCLUDED.cbc, loan_cases.cbc),
      lpp = COALESCE(EXCLUDED.lpp, loan_cases.lpp),
      cbc_lpp = COALESCE(EXCLUDED.cbc_lpp, loan_cases.cbc_lpp),
      rollback = COALESCE(EXCLUDED.rollback, loan_cases.rollback),
      clearance = COALESCE(EXCLUDED.clearance, loan_cases.clearance),
      first_emi_due_date = COALESCE(EXCLUDED.first_emi_due_date, loan_cases.first_emi_due_date),
      loan_maturity_date = COALESCE(EXCLUDED.loan_maturity_date, loan_cases.loan_maturity_date),
      tenor = COALESCE(EXCLUDED.tenor, loan_cases.tenor),
      pro = COALESCE(EXCLUDED.pro, loan_cases.pro),
      status = EXCLUDED.status,
      ptp_date = COALESCE(EXCLUDED.ptp_date, loan_cases.ptp_date),
      telecaller_ptp_date = EXCLUDED.telecaller_ptp_date,
      rollback_yn = COALESCE(EXCLUDED.rollback_yn, loan_cases.rollback_yn),
      company_name = COALESCE(EXCLUDED.company_name, loan_cases.company_name)
    RETURNING (xmax = 0) AS is_insert`,
    [
      data.agentId, data.fosName, data.loanNo, data.customerName,
      data.bkt, data.appId, data.address, data.mobileNo,
      data.referenceAddress, data.pos, data.assetMake, data.registrationNo, data.engineNo, data.chassisNo,
      data.emiAmount, data.emiDue, data.cbc, data.lpp, data.cbcLpp,
      data.rollback, data.clearance,
      data.firstEmiDueDate || null, data.loanMaturityDate || null,
      data.tenor, data.pro, data.status || "Unpaid",
      data.latestFeedback, data.feedbackComments,
      data.ptpDate || null, data.telecallerPtpDate || null,
      data.rollbackYn ?? null,
      data.companyName || null,
    ]
  );
  return result.rows[0]?.is_insert ? "inserted" : "updated";
}

export async function getRequiredDeposits(agentId: number) {
  const result = await query(
    `SELECT rd.*, fa.name as agent_name FROM required_deposits rd
     JOIN fos_agents fa ON rd.agent_id = fa.id
     WHERE rd.agent_id = $1 ORDER BY rd.created_at DESC`, [agentId]
  );
  return result.rows;
}

export async function getAllRequiredDeposits() {
  const result = await query(
    `SELECT rd.*, fa.name as agent_name FROM required_deposits rd
     JOIN fos_agents fa ON rd.agent_id = fa.id
     ORDER BY fa.name, rd.created_at DESC`
  );
  return result.rows;
}

export async function createRequiredDeposit(data: { agentId: number; amount: number; description?: string; dueDate?: string }) {
  const result = await query(
    `INSERT INTO required_deposits (agent_id, amount, description, due_date) VALUES ($1,$2,$3,$4) RETURNING *`,
    [data.agentId, data.amount, data.description || null, data.dueDate || null]
  );
  return result.rows[0];
}

export async function deleteRequiredDeposit(id: number) {
  await query(`DELETE FROM required_deposits WHERE id = $1`, [id]);
}

export async function upsertBktCase(data: any) {
  const result = await query(
    `INSERT INTO bkt_cases (
       case_category, agent_id, fos_name, customer_name, loan_no, bkt, app_id,
       address, mobile_no, ref1_name, ref1_mobile, ref2_name, ref2_mobile, reference_address,
       pos, asset_name, asset_make, registration_no, engine_no, chassis_no,
       emi_amount, emi_due, cbc, lpp, cbc_lpp, rollback, clearance,
       first_emi_due_date, loan_maturity_date, tenor, pro, status, ptp_date, telecaller_ptp_date
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
     )
     ON CONFLICT (loan_no) DO UPDATE SET
       case_category = EXCLUDED.case_category,
       agent_id = COALESCE(EXCLUDED.agent_id, bkt_cases.agent_id),
       fos_name = COALESCE(EXCLUDED.fos_name, bkt_cases.fos_name),
       customer_name = COALESCE(EXCLUDED.customer_name, bkt_cases.customer_name),
       bkt = COALESCE(EXCLUDED.bkt, bkt_cases.bkt),
       app_id = COALESCE(EXCLUDED.app_id, bkt_cases.app_id),
       address = COALESCE(EXCLUDED.address, bkt_cases.address),
       mobile_no = COALESCE(EXCLUDED.mobile_no, bkt_cases.mobile_no),
       ref1_name = COALESCE(EXCLUDED.ref1_name, bkt_cases.ref1_name),
       ref1_mobile = COALESCE(EXCLUDED.ref1_mobile, bkt_cases.ref1_mobile),
       ref2_name = COALESCE(EXCLUDED.ref2_name, bkt_cases.ref2_name),
       ref2_mobile = COALESCE(EXCLUDED.ref2_mobile, bkt_cases.ref2_mobile),
       reference_address = COALESCE(EXCLUDED.reference_address, bkt_cases.reference_address),
       pos = COALESCE(EXCLUDED.pos, bkt_cases.pos),
       asset_name = COALESCE(EXCLUDED.asset_name, bkt_cases.asset_name),
       asset_make = COALESCE(EXCLUDED.asset_make, bkt_cases.asset_make),
       registration_no = COALESCE(EXCLUDED.registration_no, bkt_cases.registration_no),
       engine_no = COALESCE(EXCLUDED.engine_no, bkt_cases.engine_no),
       chassis_no = COALESCE(EXCLUDED.chassis_no, bkt_cases.chassis_no),
       emi_amount = COALESCE(EXCLUDED.emi_amount, bkt_cases.emi_amount),
       emi_due = COALESCE(EXCLUDED.emi_due, bkt_cases.emi_due),
       cbc = COALESCE(EXCLUDED.cbc, bkt_cases.cbc),
       lpp = COALESCE(EXCLUDED.lpp, bkt_cases.lpp),
       cbc_lpp = COALESCE(EXCLUDED.cbc_lpp, bkt_cases.cbc_lpp),
       rollback = COALESCE(EXCLUDED.rollback, bkt_cases.rollback),
       clearance = COALESCE(EXCLUDED.clearance, bkt_cases.clearance),
       first_emi_due_date = COALESCE(EXCLUDED.first_emi_due_date, bkt_cases.first_emi_due_date),
       loan_maturity_date = COALESCE(EXCLUDED.loan_maturity_date, bkt_cases.loan_maturity_date),
       tenor = COALESCE(EXCLUDED.tenor, bkt_cases.tenor),
       pro = COALESCE(EXCLUDED.pro, bkt_cases.pro),
       status = COALESCE(EXCLUDED.status, bkt_cases.status),
       ptp_date = COALESCE(EXCLUDED.ptp_date, bkt_cases.ptp_date),
       telecaller_ptp_date = EXCLUDED.telecaller_ptp_date
     RETURNING id, (xmax = 0) as is_new`,
    [
      data.caseCategory, data.agentId, data.fosName, data.customerName, data.loanNo,
      data.bkt, data.appId, data.address, data.mobileNo,
      data.ref1Name, data.ref1Mobile, data.ref2Name, data.ref2Mobile, data.referenceAddress,
      data.pos, data.assetName, data.assetMake, data.registrationNo, data.engineNo, data.chassisNo,
      data.emiAmount, data.emiDue, data.cbc, data.lpp, data.cbcLpp,
      data.rollback, data.clearance, data.firstEmiDueDate, data.loanMaturityDate,
      data.tenor, data.pro, data.status, data.ptpDate || null, data.telecallerPtpDate || null,
    ]
  );
  return result.rows[0]?.is_new ? "inserted" : "updated";
}

export async function getAllBktCases(category?: string) {
  if (category === "penal") {
    return (await query(`SELECT bc.*, fa.name as agent_name FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id = fa.id WHERE bc.cbc IS NOT NULL AND bc.cbc::numeric > 0 ORDER BY fa.name NULLS LAST, bc.customer_name`)).rows;
  }
  if (category) {
    return (await query(`SELECT bc.*, fa.name as agent_name FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id = fa.id WHERE bc.case_category = $1 ORDER BY fa.name NULLS LAST, bc.customer_name`, [category])).rows;
  }
  return (await query(`SELECT bc.*, fa.name as agent_name FROM bkt_cases bc LEFT JOIN fos_agents fa ON bc.agent_id = fa.id ORDER BY bc.case_category, bc.customer_name`)).rows;
}

export async function getBktCasesByAgent(agentId: number, category?: string) {
  if (category === "penal") {
    return (await query(`SELECT * FROM bkt_cases WHERE agent_id = $1 AND cbc IS NOT NULL AND cbc::numeric > 0 ORDER BY customer_name`, [agentId])).rows;
  }
  if (category) {
    return (await query(`SELECT * FROM bkt_cases WHERE agent_id = $1 AND case_category = $2 ORDER BY customer_name`, [agentId, category])).rows;
  }
  return (await query(`SELECT * FROM bkt_cases WHERE agent_id = $1 ORDER BY case_category, customer_name`, [agentId])).rows;
}

// ✅ UPDATED: $17 = monthly_feedback
export async function updateBktCaseFeedback(
  id: number,
  status: string,
  feedback: string,
  comments: string,
  ptpDate?: string | null,
  rollbackYn?: boolean | null,
  extra?: FeedbackExtra
) {
  await query(
    `UPDATE bkt_cases SET
       status             = $1,
       latest_feedback    = $2,
       feedback_comments  = $3,
       feedback_date      = NOW(),
       ptp_date           = $5,
       rollback_yn        = COALESCE($6,  rollback_yn),
       customer_available = COALESCE($7,  customer_available),
       vehicle_available  = COALESCE($8,  vehicle_available),
       third_party        = COALESCE($9,  third_party),
       third_party_name   = COALESCE($10, third_party_name),
       third_party_number = COALESCE($11, third_party_number),
       feedback_code      = COALESCE(NULLIF($12,''), feedback_code),
       projection         = COALESCE(NULLIF($13,''), projection),
       non_starter        = COALESCE($14, non_starter),
       kyc_purchase       = COALESCE($15, kyc_purchase),
       workable           = COALESCE($16, workable),
       monthly_feedback   = COALESCE(NULLIF($17,''), monthly_feedback),
       ptp_date_mf        = COALESCE($18, ptp_date_mf),
       shifted_city       = COALESCE(NULLIF($19,''), shifted_city),
       occupation         = COALESCE(NULLIF($20,''), occupation)
     WHERE id = $4`,
    [
      status, feedback, comments, id,
      ptpDate || null,
      rollbackYn != null ? rollbackYn : null,
      extra?.customerAvailable   ?? null,
      extra?.vehicleAvailable    ?? null,
      extra?.thirdParty          ?? null,
      extra?.thirdPartyName      ?? null,
      extra?.thirdPartyNumber    ?? null,
      extra?.feedbackCode        ?? null,
      extra?.projection          ?? null,
      extra?.nonStarter          ?? null,
      extra?.kycPurchase         ?? null,
      extra?.workable            ?? null,
      extra?.monthlyFeedback     ?? null,  // ✅ $17
       extra?.ptpDateMf           ?? null,  // $18
      extra?.shiftedCity         ?? null,  // $19
      extra?.occupation          ?? null,  // $20
    ]
  );
}

export async function upsertBktPerfSummary(data: {
  fosName: string; agentId: number | null; bkt: string;
  posPaid: number; posUnpaid: number; posGrandTotal: number; posPercentage: number;
  countPaid: number; countUnpaid: number; countTotal: number;
  rollbackPaid: number; rollbackUnpaid: number; rollbackGrandTotal: number; rollbackPercentage: number;
}) {
  await query(
    `INSERT INTO bkt_perf_summary
       (fos_name, agent_id, bkt,
        pos_paid, pos_unpaid, pos_grand_total, pos_percentage,
        count_paid, count_unpaid, count_total,
        rollback_paid, rollback_unpaid, rollback_grand_total, rollback_percentage,
        uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
     ON CONFLICT (fos_name, bkt) DO UPDATE SET
       agent_id             = COALESCE(EXCLUDED.agent_id, bkt_perf_summary.agent_id),
       pos_paid             = EXCLUDED.pos_paid,
       pos_unpaid           = EXCLUDED.pos_unpaid,
       pos_grand_total      = EXCLUDED.pos_grand_total,
       pos_percentage       = EXCLUDED.pos_percentage,
       count_paid           = EXCLUDED.count_paid,
       count_unpaid         = EXCLUDED.count_unpaid,
       count_total          = EXCLUDED.count_total,
       rollback_paid        = EXCLUDED.rollback_paid,
       rollback_unpaid      = EXCLUDED.rollback_unpaid,
       rollback_grand_total = EXCLUDED.rollback_grand_total,
       rollback_percentage  = EXCLUDED.rollback_percentage,
       uploaded_at          = NOW()`,
    [
      data.fosName, data.agentId, data.bkt,
      data.posPaid, data.posUnpaid, data.posGrandTotal, data.posPercentage,
      data.countPaid, data.countUnpaid, data.countTotal,
      data.rollbackPaid, data.rollbackUnpaid, data.rollbackGrandTotal, data.rollbackPercentage,
    ]
  );
}

export async function applyBktPerfDelta(
  agentId: number, bkt: string,
  deltaPosPaid: number, deltaPosUnpaid: number,
  deltaCountPaid: number, deltaCountUnpaid: number,
  deltaRbPaid: number, deltaRbUnpaid: number,
) {
  if (deltaPosPaid === 0 && deltaCountPaid === 0 && deltaRbPaid === 0) return;
  await query(
    `UPDATE bkt_perf_summary SET
       pos_paid        = GREATEST(0, pos_paid       + $1),
       pos_unpaid      = GREATEST(0, pos_unpaid     + $2),
       pos_percentage  = CASE WHEN pos_grand_total > 0 THEN ROUND((GREATEST(0, pos_paid + $1) / pos_grand_total) * 100, 2) ELSE 0 END,
       count_paid      = GREATEST(0, count_paid     + $3),
       count_unpaid    = GREATEST(0, count_unpaid   + $4),
       rollback_paid   = GREATEST(0, rollback_paid  + $5),
       rollback_unpaid = GREATEST(0, rollback_unpaid+ $6),
       rollback_percentage = CASE WHEN rollback_grand_total > 0 THEN ROUND((GREATEST(0, rollback_paid + $5) / rollback_grand_total) * 100, 2) ELSE 0 END
     WHERE agent_id = $7 AND bkt = $8`,
    [deltaPosPaid, deltaPosUnpaid, deltaCountPaid, deltaCountUnpaid, deltaRbPaid, deltaRbUnpaid, agentId, bkt]
  );
}

export async function getAllBktPerfSummary() {
  const result = await query(
    `SELECT s.*, fa.name as agent_real_name FROM bkt_perf_summary s
     LEFT JOIN fos_agents fa ON fa.id = s.agent_id
     ORDER BY s.fos_name, s.bkt`
  );
  return result.rows;
}

export async function getBktPerfSummaryByAgent(agentId: number) {
  const result = await query(
    `SELECT * FROM bkt_perf_summary WHERE agent_id = $1 ORDER BY bkt`, [agentId]
  );
  return result.rows;
}

// ─── Call Logs ────────────────────────────────────────────────────────────────

export async function insertCallLog(data: {
  caseId: number;
  caseType: "loan" | "bkt";
  agentId: number;
  loanNo: string | null;
  customerName: string | null;
  outcome: string | null;
  comments: string | null;
  ptpDate: string | null;
  status: string | null;
}) {
  await query(
    `INSERT INTO call_logs
       (case_id, case_type, agent_id, loan_no, customer_name, outcome, comments, ptp_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.caseId, data.caseType, data.agentId,
      data.loanNo, data.customerName,
      data.outcome, data.comments, data.ptpDate || null, data.status,
    ]
  );
}

export async function getCallLogsByCase(caseId: number, caseType: string) {
  const result = await query(
    `SELECT cl.*, fa.name AS agent_name
     FROM call_logs cl
     LEFT JOIN fos_agents fa ON fa.id = cl.agent_id
     WHERE cl.case_id = $1 AND cl.case_type = $2
     ORDER BY cl.logged_at DESC`,
    [caseId, caseType]
  );
  return result.rows;
}

export async function getCallLogsByAgent(agentId: number, limit = 200) {
  const result = await query(
    `SELECT cl.*, fa.name AS agent_name
     FROM call_logs cl
     LEFT JOIN fos_agents fa ON fa.id = cl.agent_id
     WHERE cl.agent_id = $1
     ORDER BY cl.logged_at DESC
     LIMIT $2`,
    [agentId, limit]
  );
  return result.rows;
}

export async function getAllCallLogs(limit = 500) {
  const result = await query(
    `SELECT cl.*, fa.name AS agent_name
     FROM call_logs cl
     LEFT JOIN fos_agents fa ON fa.id = cl.agent_id
     ORDER BY cl.logged_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
