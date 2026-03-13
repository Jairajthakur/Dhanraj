import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const fosAgents = pgTable("fos_agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).unique().notNull(),
  password: text("password").notNull(),
  role: varchar("role", { length: 20 }).default("fos"),
  phone: varchar("phone", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const loanCases = pgTable("loan_cases", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => fosAgents.id),
  fosName: varchar("fos_name", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  loanNo: varchar("loan_no", { length: 100 }).unique().notNull(),
  bkt: integer("bkt"),
  appId: varchar("app_id", { length: 100 }),
  address: text("address"),
  mobileNo: varchar("mobile_no", { length: 100 }),
  ref1Name: varchar("ref1_name", { length: 255 }),
  ref1Mobile: varchar("ref1_mobile", { length: 50 }),
  ref2Name: varchar("ref2_name", { length: 255 }),
  ref2Mobile: varchar("ref2_mobile", { length: 50 }),
  referenceAddress: text("reference_address"),
  pos: numeric("pos", { precision: 14, scale: 2 }),
  assetName: varchar("asset_name", { length: 255 }),
  assetMake: varchar("asset_make", { length: 255 }),
  registrationNo: varchar("registration_no", { length: 100 }),
  engineNo: varchar("engine_no", { length: 100 }),
  chassisNo: varchar("chassis_no", { length: 100 }),
  emiAmount: numeric("emi_amount", { precision: 14, scale: 2 }),
  emiDue: numeric("emi_due", { precision: 14, scale: 2 }),
  cbc: numeric("cbc", { precision: 14, scale: 2 }),
  lpp: numeric("lpp", { precision: 14, scale: 2 }),
  cbcLpp: numeric("cbc_lpp", { precision: 14, scale: 2 }),
  rollback: numeric("rollback", { precision: 14, scale: 2 }),
  clearance: numeric("clearance", { precision: 14, scale: 2 }),
  firstEmiDueDate: date("first_emi_due_date"),
  loanMaturityDate: date("loan_maturity_date"),
  tenor: integer("tenor"),
  refNumber: varchar("ref_number", { length: 100 }),
  pro: varchar("pro", { length: 100 }),
  status: varchar("status", { length: 50 }).default("Unpaid"),
  latestFeedback: varchar("latest_feedback", { length: 255 }),
  feedbackComments: text("feedback_comments"),
  feedbackDate: timestamp("feedback_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => fosAgents.id),
  date: date("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const salaryDetails = pgTable("salary_details", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => fosAgents.id),
  month: varchar("month", { length: 20 }).notNull(),
  year: integer("year").notNull(),
  presentDays: integer("present_days").default(0),
  paymentAmount: numeric("payment_amount", { precision: 12, scale: 2 }).default("0"),
  incentiveAmount: numeric("incentive_amount", { precision: 12, scale: 2 }).default("0"),
  petrolExpense: numeric("petrol_expense", { precision: 12, scale: 2 }).default("0"),
  mobileExpense: numeric("mobile_expense", { precision: 12, scale: 2 }).default("0"),
  grossPayment: numeric("gross_payment", { precision: 12, scale: 2 }).default("0"),
  advance: numeric("advance", { precision: 12, scale: 2 }).default("0"),
  otherDeductions: numeric("other_deductions", { precision: 12, scale: 2 }).default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).default("0"),
  netSalary: numeric("net_salary", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const depositions = pgTable("depositions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => fosAgents.id),
  loanCaseId: integer("loan_case_id").references(() => loanCases.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  depositionDate: date("deposition_date").notNull(),
  receiptNo: varchar("receipt_no", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bktCases = pgTable("bkt_cases", {
  id: serial("id").primaryKey(),
  caseCategory: varchar("case_category", { length: 20 }).notNull().default("bkt1"),
  agentId: integer("agent_id").references(() => fosAgents.id),
  fosName: varchar("fos_name", { length: 255 }),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  loanNo: varchar("loan_no", { length: 100 }).unique().notNull(),
  bkt: integer("bkt"),
  appId: varchar("app_id", { length: 100 }),
  address: text("address"),
  mobileNo: varchar("mobile_no", { length: 100 }),
  ref1Name: varchar("ref1_name", { length: 255 }),
  ref1Mobile: varchar("ref1_mobile", { length: 50 }),
  ref2Name: varchar("ref2_name", { length: 255 }),
  ref2Mobile: varchar("ref2_mobile", { length: 50 }),
  referenceAddress: text("reference_address"),
  pos: numeric("pos", { precision: 14, scale: 2 }),
  assetName: varchar("asset_name", { length: 255 }),
  assetMake: varchar("asset_make", { length: 255 }),
  registrationNo: varchar("registration_no", { length: 100 }),
  engineNo: varchar("engine_no", { length: 100 }),
  chassisNo: varchar("chassis_no", { length: 100 }),
  emiAmount: numeric("emi_amount", { precision: 14, scale: 2 }),
  emiDue: numeric("emi_due", { precision: 14, scale: 2 }),
  cbc: numeric("cbc", { precision: 14, scale: 2 }),
  lpp: numeric("lpp", { precision: 14, scale: 2 }),
  cbcLpp: numeric("cbc_lpp", { precision: 14, scale: 2 }),
  rollback: numeric("rollback", { precision: 14, scale: 2 }),
  clearance: numeric("clearance", { precision: 14, scale: 2 }),
  firstEmiDueDate: date("first_emi_due_date"),
  loanMaturityDate: date("loan_maturity_date"),
  tenor: integer("tenor"),
  pro: varchar("pro", { length: 100 }),
  status: varchar("status", { length: 50 }).default("Unpaid"),
  latestFeedback: varchar("latest_feedback", { length: 255 }),
  feedbackComments: text("feedback_comments"),
  feedbackDate: timestamp("feedback_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type FosAgent = typeof fosAgents.$inferSelect;
export type LoanCase = typeof loanCases.$inferSelect;
export type BktCase = typeof bktCases.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type SalaryDetail = typeof salaryDetails.$inferSelect;
export type Deposition = typeof depositions.$inferSelect;
