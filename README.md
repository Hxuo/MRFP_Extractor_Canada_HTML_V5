# MRFP Extractor Canada — Browser v5

**Browser-based Canadian MRFP Financial Data Extraction and PDF Evidence Verification**  
**Project status:** Working v5 baseline (November 2026)  
**Technology:** HTML, CSS, JavaScript, PDF.js, browser-local storage  
**Deployment:** Open the local `index.html` in a compatible browser; no application server is required for the main workflow.
**Created by:** Alonzo, Lexter Angelo

> **Version convention:** This README documents the browser-only project from **v1 through v5**. The later auto-highlight and orange-box UI improvements are included as part of **v5**; they are not listed as a separate numbered release. This is a consolidated development history, not a claim that every intermediate version has its own preserved release ZIP.

---

## 1. Project overview

**MRFP Extractor Canada** helps users collect selected financial data from Canadian mutual fund and exchange-traded fund (ETF) *Management Reports of Fund Performance* (MRFPs). Instead of manually finding each ratio across long PDFs, users can extract data by fund and Class/Series, inspect the original financial table, correct results, verify them, save their work locally, and export structured records.

### Data extracted

| Field | Meaning |
|---|---|
| **FMC** | Fund Management Company or recognized fund family/manager |
| **Fund Name** | Name of the mutual fund or ETF |
| **Class / Series** | Reported share class, series, or ETF units, such as Series A, Series F, Series FT5, Class O, or ETF Series |
| **MER** | Management Expense Ratio, using the appropriate reported source metric |
| **TER** | Trading Expense Ratio |
| **PTR** | Portfolio Turnover Rate |
| **MRFP Date** | Relevant latest reporting-period date |

Missing or unavailable figures are not silently replaced with zero. A PDF may print `—`, `--`, `n/a`, or a similar placeholder; these differ from genuine numeric `0` or `0.00`.

### Design principles

- **Accuracy over forced completeness:** Never invent a financial value or PDF source location.
- **FMC-aware parsing:** Reuse common PDF processing while interpreting known FMC-specific layouts precisely.
- **Latest period first:** Do not take a previous year's ratio merely because its number matches.
- **Traceable evidence:** Show where extracted values came from, not just the final numbers.
- **Manual verification:** The user remains responsible for reviewing and marking a record Verified.
- **Regression protection:** New FMC or layout support must not silently break existing working funds.

---

## 2. Version-by-version development history

### Version 1 — Initial browser-only extractor

**Objective:** Build a practical local PDF extraction tool that does not depend on a running Python/PHP backend.

Initial capabilities established in the browser project:

- Basic HTML/CSS/JavaScript interface for selecting and processing MRFP PDFs.
- Original PDF preview beside extracted financial results.
- Fund/FMC identification and Class/Series recognition.
- Extraction of MER, TER, PTR and reporting-period information.
- Rule-based and FMC-specific financial table interpretation.
- Manual editing, review/verification, Re-scan and saved extraction History.
- CSV and Excel export of the collected data.
- Initial source-reference test files for parser maintenance.

**Early v1 refinements** included better NBI series recognition, broader BMO mutual fund/ETF coverage, retention of recognized classes even when values were blank, and correction of PDF preview switching between documents.

**Milestone:** A complete *upload → extract → review → correct → save → export* workflow operating in the browser.

### Version 2 — Broader FMC and PDF-layout support

**Objective:** Extend extraction to more Canadian fund managers without rewriting the working v1 workflow.

The surviving project records document this period mainly through **v2-1** and **v2-2**; there is no separately verified, complete standalone v2 release changelog in the available archive.

#### v2-1 — New managers, fund types and class naming

- Expanded or refined support for **Vanguard, Ninepoint, Global X, RBC, Fidelity, IG Mackenzie, BMO, AGF, and Brandes**.
- Improved identification of ETF units, share classes, and nonstandard Class/Series names.
- Strengthened treatment of missing figures and variant financial-table structures.
- Added a further batch of real MRFP samples for reference and regression testing.

#### v2-2 — More FMCs and harder multi-series formats

- Extended handling for **CIBC, Hamilton, NewGen, RP Investment Advisors (RPIA), and Leith Wheeler**.
- Improved Fidelity and TD ETF class detection.
- Addressed Dynamic classes/series spanning multiple pages and USD-denominated series.
- Improved CI multi-series tables and further BMO, IG/Mackenzie, BlackRock/iShares, Vanguard, Global X and Scotia layouts.
- Preserved older FMC-specific extraction branches so that new support did not replace known-good logic.

Other early expansion work covered layouts from TD, Lysander-Canso, NEI, Fidelity, Harvest, Pender, and related issuers. The exact subrelease for every one of those early adjustments is not separately documented.

**Milestone:** The extractor became **layout-aware across multiple FMCs**, not a one-format or one-fund parser.

### Version 3 — Multi-series extraction and difficult PDF structures

**Objective:** Improve completeness when financial reports contain many classes, unusual headings or PDF text fragments.

- Added a **CI multi-series correction** for reports where series names and explanatory footnotes were split across lines.
- Improved collection of all applicable series instead of returning only the first recognized series.
- Introduced targeted handling for difficult **Middlefield, RBC ETF and First Trust** formats and two-column tables.
- Expanded batch-based testing using real MRFP PDFs, including batches of difficult, previously unseen documents.
- Continued to retain functioning FMC parsers and apply narrow compatibility fixes rather than replacing the whole extraction engine.

**Milestone:** Greater series completeness and more reliable PDF geometry/table handling.

### Version 3-1 — Extraction correction, source robustness and Settings

**Objective:** Repair known cases of incorrect or empty results and improve storage control.

- Fixed identified source-PDF problems involving zero-result or incomplete **Dynamic, Mackenzie, iShares, and Global X** scans.
- Corrected selected iShares class labels, fund-name detection and a Dynamic MER mismatch.
- Added an additional **Global X geometry/position-based extraction path** to handle text split into fragments.
- Improved recognition of split percentages/decimals encountered with PDF.js (for example, decimal pieces that must be reconstructed within their table context).
- Added Settings controls, including **Clear Stored PDFs** (retain saved extraction records while deleting stored PDF copies) and **Reset All Saved Data** (clear saved application information after confirmation).
- Improved retry/re-scan behavior for previously saved records with missing or zero rows.
- Refined manual-correction and Clear List confirmation workflows in later v3-1-era adjustments.
- Added further reference and regression tests for known problematic reports.

**Milestone:** More dependable extraction and safer maintenance of browser-saved data.

### Version 4 — Multi-document workspace, History, Reports and portability

**Objective:** Improve usability and operational workflow while keeping existing financial parsers intact.

Main changes:

- Added a more complete top-level navigation layout: **Extract, History, Reports, Settings**.
- Implemented **sequential batch processing of up to five PDFs**.
- Added per-document selection, progress/retry handling and independent results in the batch workspace.
- Improved **Recent Documents**, **View All Saved History**, document restoration, search/pagination of History and **Clear List** without deleting History.
- Introduced dedicated reporting and more comprehensive Settings/confirmation controls.
- Maintained manual editing, verification, Re-scan and PDF preview.
- Preserved three export scopes:
  - **Export Data:** currently selected document.
  - **Export All Listed:** documents currently in Recent Documents, including restored items.
  - **Export All Data:** eligible saved documents across History.
- Preserved the two Excel worksheets: **Extraction Results** (styled header and filters) and **Lipper Format** (plain header, without filter/table styling).
- Bundled **PDF.js 3.11.174** locally under `vendor/pdfjs/`, with a fallback loading path, to improve portability.
- Kept the browser IndexedDB storage model compatible with existing saved data; included an optional v3.1 History migration helper.
- Updated the PDF regression runner to pass real PDF.js text geometry, correcting a *test-harness* mismatch rather than changing financial extraction logic.

**What v4 deliberately protected:** Existing financial parsers, normal PDF text grouping/OCR decision logic, Excel formatting and established browser-saved records.

**Milestone:** A practical **five-document extraction workspace** with dedicated History, Reports and Settings.

### Version 5 — Interactive evidence verification and consolidated FMC improvements

**Objective:** Make extracted figures easy to verify in the original PDF, while preserving existing extraction functionality and improving source-location coverage across FMCs.

#### 5.1 PDF evidence viewer and source mapping

- Added `js/evidence-locator.js` for **original PDF source detection** separate from financial extraction.
- Added `js/evidence-viewer.js`, a **PDF.js canvas-based viewer**, replacing the default browser-native iframe as the principal evidence viewer (with fallback behavior retained as applicable).
- Added automatic navigation to the **earliest relevant evidence page** in the latest reporting period.
- Added **one Search icon beside Edit for each Class/Series**, rather than separate MER/TER/PTR search buttons.
- Search navigates to the correct class/series table and locates the original **MER, TER and PTR** source cells.
- Uses fund identity, class/series, period, metric labels, row/column structure and PDF.js text coordinates—not simple document-wide number matching.
- Supports legitimate split decimal fragments and printed placeholders such as `—`, `--`, `n/a`, and numeric zero when confidently located.
- Preserves original PDF evidence separately from manually edited numbers.
- Adds per-document evidence mapping and backward-compatible revalidation of older saved records when the original PDF is still present.
- Handles batch document switching, zoom, scrolling, multi-page evidence and lazy PDF rendering without mixing one fund's highlights with another's.

#### 5.2 High-quality PDF rendering

- Improved clarity compared with the initial canvas viewer by raising the adaptive canvas rendering resolution.
- Improved PDF embedded-font handling while keeping memory usage bounded for larger reports.
- Preserved zoom, navigation, scrolling and existing PDF/source coordinates.

#### 5.3 FMC-specific evidence locator expansion

The shared PDF geometry engine was extended with **FMC-aware adapters**, each checking actual table headings, series/date relationships, and metric cells rather than relying on fixed values or page numbers.

| FMC / family | Main v5 source-location improvement |
|---|---|
| **RBC** | Correct reported MER column instead of adjacent **MER Before Absorption**; ETF layout and class-date matching. |
| **CI** | Correct MER **After Taxes** source when defined by that report layout; multi-series/metric mapping and literal missing markers. |
| **RPIA** | Multi-page class/date tables with correct first evidence-page navigation. |
| **Fidelity** | Reusable per-Series Financial Highlights blocks, mixed years, ETF Series and printed missing values. |
| **Dynamic** | Dated Class/Series rows, continuation pages, USD/ETF series and MER-versus-pre-waiver columns. |
| **NBI** | Series-specific year/date blocks, including varying annual/interim month/day columns. |
| **TD** | Side-by-side series, ETF tables and historical `N/A` alignment. |
| **BlackRock / iShares** | CAD/USD units, ratio-row labels, dates and missing markers. |
| **IG Mackenzie / Mackenzie** | Side-by-side ratio blocks, interim columns, `n/a`, dashes and ETF/series recognition. |
| **BMO / AGF** | Multi-series layouts, correct ratio headers, missing markers and single-year launch cases. |
| **Desjardins** | Individual Class ratio blocks across pages, including current-only and multi-year tables. |
| **Brandes / Bridgehouse, NEI** | Distinct dated/series table layouts, zeros and missing values. |
| **Pender, Scotia** | Year-column Class ratios and dated Series rows, including USD series. |
| **Franklin, Vanguard, Hamilton, Lysander-Canso** | Additional manager-specific ratio-row/year-column source detection. |
| **Manulife, Purpose, NewGen, Leith Wheeler** | Multiple/table-side class matching, duplicate values, USD classes, zeros and `n/a`. |
| **Ninepoint, Harvest, Global X, Middlefield, First Trust, Sun Life** | Final isolated source gaps, printed dashes and split numeric fragments. |

**Special extraction fix during v5:** One IG Mackenzie **Series T JNL** continuation table had a current-period numeric column without a repeated current-year heading. A narrow, evidence-validated parser adjustment recovered **MER 2.22, TER 0.03 and PTR 60.94** in that tested report; the other extraction values were compared for regression. This was a documented exception to the otherwise locator-focused v5 updates.

#### 5.4 Automatic highlighting and Search focus — included in v5

The latest working v5 behavior also includes the later visual refinements:

- **After extraction:** All confidently located MER/TER/PTR cells for all extracted Class/Series are automatically shown as **subtle light-yellow boxes**, without clicking Search.
- **Across pages:** Highlights remain associated with their original source pages when the user scrolls or navigates.
- **When Search is clicked:** The selected Class/Series's three located values receive **orange boxed highlights**; other located values stay light yellow.
- **Clean focus appearance:** No extra trailing accent line; source values remain readable inside their boxes.
- **History and document switching:** Revalidate supported older evidence maps and clear overlays when changing the active PDF.
- These changes affect evidence display and interaction, **not financial ratio calculations**.

**Versioning note:** These auto-highlight and orange-box improvements are documented **under v5** in this README, rather than being presented as a distinct v5-1 release.

#### 5.5 Regression-testing results and scope

Across the supplied v5 native-text test dataset:

| Item | Reported result |
|---|---:|
| Real MRFP PDF documents in the batch-test dataset | **120** |
| FMC/fund-family groups represented by the audit | **32 groups** |
| Extracted Class/Series records evaluated for highlighting | **549** |
| Potential MER/TER/PTR evidence cells | **1,647** |
| Source-coordinate mappings after the final v5 locator fixes | **1,647 / 1,647** |

The 1,647/1,647 result represents **coordinate/source-location coverage on this specific 120-PDF reference set**, not a certification of 100% financial accuracy on every PDF or every future FMC layout. Independent source review and user verification remain important.

Selected verification work included actual PDF.js glyph/row comparisons, wrong-fund/wrong-series/wrong-date/wrong-value negative checks, multi-page tests, old-record revalidation, and controlled Chromium rendering/Search tests. Later auto-highlight/orange-box tests also checked multi-series overlays, zoom and document switching. Test scope and limitations vary across fixes; refer to the accompanying `TEST_REPORT_V5.md` and individual `APPLY_*` notes where available.

**Milestone:** **FMC-aware extraction + high-quality PDF evidence viewer + automatic yellow source boxes + orange Search focus**, with regression-tested source mapping across the available sample set.

---

## 3. Current v5 feature summary

| Feature | User workflow |
|---|---|
| Single PDF / five-PDF batch | Select reports and process them sequentially. |
| Automatic fund and series recognition | Read supported FMC formats and latest reporting period. |
| MER, TER and PTR extraction | Create one results row per recognized Class/Series. |
| PDF evidence viewer | See original PDF beside extraction results. |
| Automatic source-page navigation | Open the first reliable evidence page. |
| Auto-highlight All | Light-yellow boxes identify located source cells without a click. |
| Search to Focus | One Search per series highlights its source cells in orange boxes. |
| Manual Edit + Verify | Correct values if needed and explicitly mark reviewed results as verified. |
| Re-scan | Reprocess an original PDF when corrections to parsing are available. |
| Recent Documents + History | Continue working, restore documents and manage saved records. |
| Reports and Settings | Review saved records and manage local stored data. |
| Excel / CSV export | Export selected document, all listed documents or saved History. |

---

## 4. Technologies and main files

| Component | Purpose |
|---|---|
| **HTML** / `index.html` | Application interface and controls. |
| **CSS** / `css/style.css` | Responsive workspace, styling and evidence-box appearance. |
| **JavaScript** / `js/app.js` | Upload/batch workflow, events, editing, verification and document switching. |
| **`js/engine.js`** | FMC detection, fund/series recognition, financial value extraction and reporting period logic. |
| **`js/pdf-reader.js`** | Native PDF text retrieval and optional OCR fallback. |
| **PDF.js 3.11.174** / `vendor/pdfjs/` | Local PDF text/position processing and canvas rendering. |
| **`js/evidence-locator.js`** | FMC-aware original source-cell mapping. |
| **`js/evidence-viewer.js`** | Automatic source-page navigation, PDF rendering and highlighted overlays. |
| **IndexedDB** / `js/storage.js` | Browser-local saved documents, PDF copies when available, edits and History. |
| **`js/excel-export.js`** | Browser-generated XLSX and CSV exports. |
| **Tesseract.js 6** | Optional OCR for scanned or low-text pages; may load on demand from the internet. |
| **Node.js + `pdfjs-dist`** | Development/regression testing only; not required for day-to-day browser operation. |

The core application is **not** a server-hosted AI model: it uses rule-based PDF parsing and source geometry. It does not require PHP, Flask, XAMPP, MySQL, or an application database server to run locally.

---

## 5. Quick start

1. Keep `index.html`, `css/`, `js/`, and `vendor/` together with their relative paths unchanged.
2. Open `index.html` with a compatible up-to-date browser, preferably Chrome or Microsoft Edge.
3. Choose one PDF or a batch of up to five PDFs and start extraction.
4. Review each recognized Class/Series and MER/TER/PTR value in the results table.
5. Inspect the original PDF. Located source cells should be highlighted in **yellow** automatically; use **Search** to focus the selected series with **orange boxes**.
6. Edit incorrect values if needed; mark a record Verified **only after actual review**.
7. Use the relevant export scope for your downstream reporting.

**Note:** Browser security rules can differ when opening a local `file://` page, especially on another device. Optional OCR may need internet access because its Tesseract resources are not guaranteed to be fully bundled. Moving to another folder/browser profile can also change access to browser-saved IndexedDB History.

---

## 6. Export behavior

| Action | Included records |
|---|---|
| **Export Data** | Current selected document only. |
| **Export All Listed** | Documents in the current Recent Documents list, including restored entries. |
| **Export All Data** | Eligible saved records throughout History. |

XLSX exports retain two worksheets:

1. **Extraction Results** — formatted header with filters.
2. **Lipper Format** — plain header, no table styling or filters; structured consolidated data for further use.

CSV outputs are also supported by the existing exporter. Do not assume that a CSV file itself can contain multiple Excel worksheets.

---

## 7. Scalability: what happens with a new fund or FMC?

This system is **extensible, not universally automatic**.

- **New fund, already-supported FMC, familiar MRFP layout:** Existing FMC-specific rules may process it without any code change.
- **New layout under a supported FMC:** Add or adapt a *layout-specific rule*, after checking actual PDF ratio tables, series and reporting dates.
- **New FMC with an unfamiliar layout:** The shared PDF reader and generic detection may help, but dedicated FMC extraction and/or evidence-location adapters may be needed.
- **No reliable source:** Keep missing values as missing and display **“Exact source location unavailable”** rather than guessing a PDF coordinate.

### Safe extension process

1. **Inspect** the new MRFP PDF(s), including year/date headings, fund name, Class/Series labels, ratio rows and adjacent alternative MER columns.
2. **Establish a baseline** from the current working project before editing source files.
3. **Check extraction first**; if the financial results are already correct, avoid changing `js/engine.js`.
4. **Create the smallest reusable FMC/layout adapter** needed. Avoid hardcoding sample filenames, ratios, report dates or page numbers.
5. **Validate the PDF source independently** against the true table row/column, not just a matching number.
6. **Test actual viewer highlights** and correct page navigation, including zeros, dashes and multi-page series.
7. **Run cross-FMC regression** against the existing PDF test corpus before release.
8. **Document changed files, confirmed results and unresolved limitations**.

**Key scalability statement:** *The application is scalable because its modular architecture supports new FMCs and reporting layouts without rebuilding the working system; new layouts may still require implementation and regression testing.*

---

## 8. Testing and release discipline

The project includes `tests/` and `batch-test/` for repeatable reference checks. The known dataset in the documented v5 release contains **120 PDFs**. Some older testing instructions and filenames refer to **97 PDFs** because they predate later sample additions; check the actual PDFs present instead of using the old number as a hard requirement.

Recommended test layers:

- **Syntax/logic:** JavaScript syntax and parser reference tests.
- **Extraction:** Compare FMC, fund, series, MRFP date, MER, TER, PTR, nulls against independently checked sources.
- **Evidence:** Validate source page/row/column and PDF.js text bounding boxes.
- **Negative checks:** Reject deliberately wrong fund, series, date and value requests.
- **Visual browser QA:** Confirm visible yellow/orange overlays, zoom, navigation and document isolation.
- **Regression:** Compare new outputs and source locations against a snapshot from the previously working version.
- **Workflow:** Re-scan, edit, Verify, History, Restore, batch retry and export scopes where the environment supports complete UI tests.

**Do not equate mapping coverage with financial extraction accuracy.** New PDF layouts, scanned documents, OCR limitations and browser differences still require review.

---

## 9. Project structure (simplified)

```text
MRFP_Extractor_Canada_HTML_v5/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── engine.js
│   ├── pdf-reader.js
│   ├── evidence-locator.js
│   ├── evidence-viewer.js
│   ├── storage.js
│   └── excel-export.js
├── vendor/
│   └── pdfjs/
├── tests/
├── batch-test/
│   ├── pdfs/
│   ├── run-pdf-regression.cjs
│   └── run-batch.cjs
├── samples/
├── migration/
├── CHANGELOG_V4.md
├── CHANGELOG_V5.md
└── TEST_REPORT_V5.md
```

Folders for regression reports, fixtures, patches and other release notes may also be included. File paths and script names can differ across historical releases.

---

## 10. Important limitations and precautions

- **FMC-specific does not mean every future document is supported.** A new layout can require a new parser or locator adapter.
- **100% mapped source coordinates in the reference set is not 100% verified financial correctness.** The original report remains the source of truth.
- **A highlighted box is a verification aid**, not independent proof that the extracted metric is financially appropriate.
- **MER is not interchangeable with every alternate MER column.** Validate standard MER versus Before Waivers, Before Absorption and, where present, Before/After Taxes using the actual report headings and footnotes.
- **OCR-based scanned PDFs can behave differently** from native-text PDFs and may not have reliable exact source coordinates.
- **Saved History is local to a browser storage context.** Clearing browser site data, switching browsers/profiles or changing `file://` origins can affect access.
- **Stored original PDFs may be unavailable** even when saved extraction results remain; in that case the application cannot honestly highlight original evidence.
- **Viewer page-counter edge case:** In some scroll positions, the counter may reflect the next partially visible page even while the highlighted source remains on the prior page. It does not itself change extracted values or source coordinates.
- **Preserve a backup** of the last confirmed working version before applying a patch.

---

## 11. Maintenance and handoff guidance

For future contributors or other development assistants:

1. Use the **actual latest working source** as the baseline, not a reconstructed project.
2. Keep working FMC parsers and custom source locators intact unless an independently verified bug requires change.
3. Keep evidence visualization separate from financial extraction whenever possible.
4. Prefer small, targeted patches with exact relative paths; avoid unrelated UI redesigns.
5. Always run the relevant dedicated FMC test plus the available full cross-FMC regression corpus.
6. Provide a before/after change report and disclose tests that were not run.
7. Preserve browser storage compatibility, the three export scopes and both Excel worksheet formats.
8. Do not delete verified or manually edited History records during a locator upgrade.

### Documentation references

- `CHANGELOG_V4.md` — v4 implementation decisions and compatibility notes.
- `CHANGELOG_V5.md` — chronological v5 evidence-locator and FMC repair notes.
- `TEST_REPORT_V5.md` — recorded testing scope and known limitations.
- `tests/` and `batch-test/` — executable and reference regression assets.
- `SYSTEM_DOCUMENTATION_v5-1.txt` — optional companion narrative documentation, if included separately in your distribution.

---

## 12. Final project summary

From **v1**, the browser project established PDF extraction and review. **v2** expanded FMC compatibility; **v3** improved difficult class/series and table handling; **v3-1** repaired known extraction defects and storage controls; **v4** introduced the five-PDF operational workspace and enhanced History/Reports; and **v5** added full source-evidence navigation, scalable FMC-aware highlighting, better PDF rendering, automatic yellow highlights and orange boxed Search focus.

**Current purpose:** Help users collect and manually verify MER, TER and PTR from supported Canadian MRFP PDFs in a portable, locally operated browser workflow, with regression-tested pathways for future FMC/layout additions.

*Prepared November 2, 2026. This consolidated history is grounded in the available archived READMEs, v4/v5 changelogs, test reports and documented v5 updates. Early releases without complete independent changelogs are identified accordingly.*
