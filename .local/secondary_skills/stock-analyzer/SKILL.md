---
name: stock-analyzer
description: Analyze stocks and companies with fundamental analysis, technical indicators, and risk assessment
---

# Stock & Investment Analyzer

Analyze stocks, companies, and investment opportunities using financial market data. Provide company profiles, technical analysis, fundamental analysis, and portfolio insights.

## When to Use

- User wants to analyze a specific stock or company
- User asks about financial metrics, earnings, or valuations
- User wants to compare investment options
- User needs portfolio analysis or allocation advice
- User asks about market trends or sector performance

## When NOT to Use

- Tax-specific questions (use tax-reviewer skill)
- Personal budgeting (use budget-planner skill)
- Insurance coverage (use insurance-optimizer skill)

## Data Sources (Use These — Don't Guess)

**Python libs (run directly, no API key):**

```python
import yfinance as yf
t = yf.Ticker("AAPL")
t.info              # P/E, market cap, beta, 52w range, margins
t.financials        # income statement (4yr)
t.balance_sheet     # debt, cash, equity
t.cashflow          # FCF, capex
t.history(period="1y")  # OHLCV for technicals
t.institutional_holders # 13F ownership

```

**Screening:** `finvizfinance` lib — filter S&P 500 by sector/valuation/signals. Finviz.com directly for heatmaps and insider tables.

**Primary filings:** Start from the EDGAR filing index: `webFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type=10-K")`. This returns a list of filings — find the most recent 10-K and `webFetch` its "Documents" link to reach the actual filing. Read Item 1A (Risk Factors) and Item 7 (MD&A) — this is where management admits problems.

**Insider activity:** `webFetch("http://openinsider.com/screener?s={ticker}")` — look for **cluster buys** (multiple execs buying same week) and **P-code** open-market purchases (insider paid cash at market price — strongest signal). Ignore option exercises (M-code) and 10b5-1 scheduled sales.

**Short interest:** webSearch `"{ticker} short interest fintel"` — >20% of float = crowded short, squeeze risk either direction.

## Methodology

### Step 1: Pull the Data (Python)

Run `yfinance` to get fundamentals + 1yr price history. Compute 50/200 SMA, RSI(14), and current price vs 52w high. Takes 10 lines of pandas.

### Step 2: Fundamental Analysis

**Valuation (compare to sector median, not S&P):**

- P/E — meaningless alone; flag if >2× sector median
- PEG — <1.0 = growth at reasonable price; >2.0 = priced for perfection
- EV/EBITDA — better than P/E for capital-intensive or leveraged cos
- P/S — only metric for unprofitable growth; >20× = needs hypergrowth to justify
- FCF yield (FCF/market cap) — >5% = genuinely cheap; negative = burning cash

**Quality red lines (practitioner heuristics):**

- Revenue growing but FCF shrinking → earnings quality problem, dig into receivables
- Debt/EBITDA >4× → one bad year from covenant breach
- Gross margin compressing 3+ quarters → losing pricing power
- Stock-based comp >15% of revenue → dilution machine (common in SaaS)
- Goodwill >50% of assets → acquisition-heavy, writedown risk

### Step 3: Technical Context (Not Prediction)

Compute in pandas — don't just describe:

- Price vs 50/200 SMA: below both = downtrend, don't catch knives
- Golden cross (50 crosses above 200) = trend confirmation, not entry signal
- RSI(14): >70 overbought / <30 oversold — only useful at extremes + divergence
- Volume: moves on 2×+ avg volume are real; low-volume moves fade
- % off 52w high: >30% drawdown in an uptrending market = something broke

### Step 4: The Retail Edge — Signals Institutions Ignore

- **Insider cluster buys** (OpenInsider): 3+ insiders open-market buying within 2 weeks is the single highest-conviction public signal. Research shows insider buys outperform; sells mean nothing (taxes/divorces/yachts).
- **Buying the dip**: insider P-code purchase after >10% drop = management disagrees with the market
- **Short squeeze setup**: short interest >20% + days-to-cover >5 + any positive catalyst
- **Unusual options**: webSearch `"{ticker} unusual options activity"` — large OTM call sweeps before earnings sometimes leak info

### Step 5: Comparative Table

Build a pandas DataFrame with peers side-by-side: P/E, PEG, rev growth, gross margin, FCF yield, debt/EBITDA. The outlier in either direction is your thesis.

## Step 6: Web Research — Find Existing Analyst Reports and News

**Use web search aggressively.** Before writing the report, gather real external research to cite:

```text
webSearch("[ticker] analyst report 2026")
webSearch("[ticker] earnings analysis site:seekingalpha.com")
webSearch("[ticker] bull case bear case site:seekingalpha.com OR site:fool.com")
webSearch("[company] investor presentation 2026 filetype:pdf")
webSearch("[ticker] price target consensus")
webSearch("[ticker] industry outlook [sector]")
webSearch("[company] competitive landscape")
webSearch("[ticker] short interest thesis")
```

**Source hierarchy (cite all of these in the report):**

| Source | What you get | How to cite |
|--------|-------------|-------------|
| **SEC EDGAR** (10-K, 10-Q, 8-K) | Primary financials, risk factors, MD&A | "Source: [Company] 10-K FY2025, Item 7" |
| **Earnings call transcripts** | Management commentary, guidance | "Source: Q4 2025 Earnings Call, CEO remarks" |
| **Sell-side research** (via SeekingAlpha, TipRanks) | Price targets, consensus estimates | "Source: TipRanks consensus, 12 analysts" |
| **Industry reports** | TAM, growth rates, competitive dynamics | "Source: [Firm] [Industry] Report, [Date]" |
| **Company investor presentations** | Management's own bull case, KPIs | "Source: [Company] Investor Day 2025" |
| **News** (Reuters, Bloomberg, CNBC) | Catalysts, M&A, regulatory | "Source: Reuters, [Date]" |

Use `webFetch` to pull actual content from SeekingAlpha articles, earnings transcripts, and investor presentations. Extract specific data points, quotes, and estimates to cite in the report.

## Excel Output — Financial Models & Data Tables

For any financial models, comp tables, DCF spreadsheets, or data-heavy outputs, **load the `excel-generator` skill** to get professional Excel formatting with formulas, charts, conditional formatting, and data validation. The excel-generator skill has detailed guidance on openpyxl and xlsxwriter usage, number formatting, chart creation, and best practices for building polished .xlsx files.

## Output — Professional Research Report as PDF

**Do not output a markdown summary.** Build a polished, professional equity research report as a **React web artifact** (like the resume/invoice skills) and export to PDF via Puppeteer. The report should look like a sell-side initiation note from Goldman, Morgan Stanley, or JP Morgan.

### Report Structure (Sell-Side Format)

Follow the standard institutional research report format:

**Page 1 — Cover / Executive Summary:**

- Company name, ticker, exchange, current price, market cap
- **Rating**: Buy / Hold / Sell with price target and upside/downside %
- **Investment thesis** in 3-4 bullet points (the "elevator pitch")
- Key metrics snapshot: P/E, EV/EBITDA, revenue growth, FCF yield
- A **1-year price chart** (generated via matplotlib/plotly, embedded as image)

**Pages 2-3 — Investment Thesis:**

- Bull case (with probability weighting if possible)
- Bear case (required — what kills this trade?)
- Key catalysts with expected timeline
- Competitive positioning / moat analysis

**Pages 3-4 — Financial Analysis:**

- Revenue breakdown by segment (with a **stacked bar chart**)
- Margin trends over 4+ quarters (with a **line chart**)
- FCF bridge / waterfall
- Balance sheet health (debt maturity, liquidity)
- Peer comparison table (pulled from yfinance for 3-5 peers)

**Page 5 — Valuation:**

- DCF model summary (show assumptions: WACC, terminal growth, revenue CAGR)
- Comparable company analysis table
- Historical valuation range (P/E or EV/EBITDA band chart)
- Price target derivation

**Page 6 — Technical Analysis:**

- Price chart with 50/200 SMA overlay (generated via matplotlib)
- Volume analysis
- Key support/resistance levels
- RSI chart

**Page 7 — Risks:**

- Ranked by probability × impact
- Regulatory, competitive, execution, macro risks
- Specific to this company, not generic boilerplate

**Final Page — Sources:**

- Full citation list with dates for every external source referenced
- Disclaimer / not financial advice

### Charts and Visualizations

Generate charts using **matplotlib** or **plotly** in Python, save as PNG, and embed in the React report:

```python
import matplotlib.pyplot as plt
import yfinance as yf

# Price chart with SMAs
df = yf.Ticker("AAPL").history(period="1y")
fig, ax = plt.subplots(figsize=(10, 5))
ax.plot(df.index, df['Close'], label='Price', color='#1a1a2e')
ax.plot(df.index, df['Close'].rolling(50).mean(), label='50 SMA', color='#e94560', linestyle='--')
ax.plot(df.index, df['Close'].rolling(200).mean(), label='200 SMA', color='#0f3460', linestyle='--')
ax.set_title("AAPL — 1 Year Price History")
ax.legend()
ax.grid(alpha=0.3)
fig.savefig("price_chart.png", dpi=150, bbox_inches='tight')

# Revenue by segment bar chart
# Margin trend line chart
# Valuation band chart
# RSI chart
```

Generate **at least 4 charts** for the report: price history with SMAs, revenue/margin trends, peer valuation comparison, and one more relevant to the thesis.

### PDF Generation

Use **jsPDF** (same approach as the resume skill) to generate the PDF with explicit point-based layout:

- `new jsPDF({ unit: "pt", format: "letter" })` — US Letter: 612×792pt
- Use 36pt margins (0.5in). Content area: 540w × 720h points.
- **Track Y position** as you render each element. When the next element would exceed `PAGE_H - MARGIN`, call `doc.addPage()` and reset Y to the top margin. Never let content silently overflow — always check before rendering.
- Embed chart PNGs via `doc.addImage()` — scale each chart to fit the content width while respecting remaining page height. If a chart won't fit on the current page, start a new page.
- Add a **header** (company name, ticker, page number) and **footer** on each page by hooking into page creation.
- Use a clean sans-serif font, navy/dark blue headers, and consistent spacing.
- The React web artifact is the **preview** — it reads the same report data and renders an HTML version. The PDF is the primary deliverable.

### Styling Guidelines

- **Header bar** on each page with company name, ticker, and page number
- **Data tables** with alternating row shading, right-aligned numbers
- **Charts** at full column width with clear titles and axis labels
- **Callout boxes** for key insights ("Management guided 15% revenue growth in Q4 call")
- **Source citations** as footnotes or inline parenthetical references
- **Professional typography**: 11pt body, 14pt section headers, consistent spacing

## Best Practices

1. **Timestamp everything** — state data pull date; yfinance prices are ~15min delayed
2. **Sector-relative only** — a 30 P/E is cheap in software, expensive in utilities
3. **Label facts vs thesis** — "FCF yield is 6%" (fact) vs "undervalued" (opinion)
4. **Bear case required** — every analysis must include: what kills this trade?
5. **Position sizing reality** — no single stock >5% for most retail portfolios; if conviction demands 20%, the conviction is the problem

## Limitations & Disclaimer

- **This is NOT financial advice.** Informational analysis only. User is responsible for all investment decisions. Recommend consulting a licensed financial advisor before acting.
- yfinance scrapes Yahoo — occasionally breaks, data may lag filings
- Cannot access Bloomberg/FactSet/real-time Level 2
- Cannot execute trades or provide personalized portfolio allocation
- Past performance does not indicate future results; all equities can go to zero
