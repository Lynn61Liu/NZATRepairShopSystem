import { chromium } from "playwright";

const input = JSON.parse(process.argv[2] || "{}");
const profilePath = input.profilePath;
const apiBaseUrl = (input.apiBaseUrl || "https://api.paymark.nz").replace(/\/$/, "");
const insightsBaseUrl = input.insightsBaseUrl || "https://insights.paymark.co.nz";
const cardAcceptorIdCode = input.cardAcceptorIdCode;
const headless = Boolean(input.headless);
const loginWaitMs = Math.max(30_000, Number(input.loginWaitMs || 600_000));
const fromUtc = input.fromUtc;
const toUtc = input.toUtc;

function write(payload) {
  process.stdout.write(JSON.stringify(payload));
}

if (!profilePath || !cardAcceptorIdCode || !fromUtc || !toUtc) {
  write({ success: false, status: 400, error: "Missing Paymark sync arguments." });
  process.exit(0);
}

const context = await chromium.launchPersistentContext(profilePath, {
  headless,
  viewport: { width: 1440, height: 900 },
  locale: "en-NZ",
});

async function getAccessToken(page) {
  return await page
    .evaluate(() => {
      const auth = JSON.parse(localStorage.getItem("auth") || "{}");
      return typeof auth.access_token === "string" ? auth.access_token : "";
    })
    .catch(() => "");
}

async function waitForAccessToken(page, timeoutMs, previousToken = "") {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const token = await getAccessToken(page);
    if (token && token !== previousToken) {
      return token;
    }
    await page.waitForTimeout(1000);
  }

  return "";
}

async function fetchTransactions(page, token) {
  return await page.evaluate(
    async ({ apiBaseUrl, cardAcceptorIdCode, fromUtc, toUtc, token }) => {
      const qs = new URLSearchParams({
        cardAcceptorIdCodes: cardAcceptorIdCode,
        transactionTimeFrom: fromUtc,
        transactionTimeTo: toUtc,
        page: "1",
        limit: "100",
      });

      const res = await fetch(`${apiBaseUrl}/merchant/transaction/?${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.paymark_api+json",
          "Content-Type": "application/vnd.paymark_api+json",
        },
      });
      const text = await res.text();

      if (!res.ok) {
        const loginExpired = text.includes("access token expired") || res.status === 401;
        return {
          success: false,
          status: loginExpired ? 428 : res.status,
          loginExpired,
          error: loginExpired
            ? "Paymark login expired. Please login again in the dedicated Paymark browser window."
            : `Paymark API returned ${res.status}.`,
          text,
        };
      }

      return { success: true, status: res.status, text };
    },
    { apiBaseUrl, cardAcceptorIdCode, fromUtc, toUtc, token }
  );
}

try {
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(insightsBaseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  let token = await getAccessToken(page);
  if (!token) {
    token = await waitForAccessToken(page, loginWaitMs);
  }

  if (!token) {
    write({
      success: false,
      status: 428,
      error: "Paymark login was not completed in the dedicated browser window.",
    });
  } else {
    let result = await fetchTransactions(page, token);
    if (!result.success && result.loginExpired) {
      await page.goto(insightsBaseUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      const refreshedToken = await waitForAccessToken(page, loginWaitMs, token);
      result = refreshedToken
        ? await fetchTransactions(page, refreshedToken)
        : {
            success: false,
            status: 428,
            error: "Paymark login was not completed in the dedicated browser window.",
          };
    }

    write(result);
  }
} catch (error) {
  write({ success: false, status: 500, error: error instanceof Error ? error.message : String(error) });
} finally {
  await context.close().catch(() => {});
}
