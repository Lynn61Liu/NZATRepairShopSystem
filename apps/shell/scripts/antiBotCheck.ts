import { chromium, Browser, BrowserContext, Page, Response, Request } from "playwright";

type RunResult = {
  mode: "headful" | "headless";
  plate: string;
  apiHit: boolean;
  apiStatusCodes: number[];
  got403: boolean;
  got429: boolean;
  recaptchaRequests: string[];
  captchaLikeRequests: string[];
  apiResponses: Array<{
    url: string;
    status: number;
    contentType: string;
    bodyPreview: string;
  }>;
  pageErrors: string[];
  consoleWarnings: string[];
  finalUrl: string;
  success: boolean;
  errorMessage?: string;
};

const TARGET_PAGE = "https://transact.nzta.govt.nz/v2/Check-Expiry";
const API_PATH = "/v2/api/vehicles/expiry/details";

function isRecaptchaUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("recaptcha") ||
    u.includes("/reload?k=") ||
    u.includes("/anchor?") ||
    u.includes("google.com/recaptcha") ||
    u.includes("gstatic.com/recaptcha")
  );
}

function isCaptchaLikeUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    isRecaptchaUrl(u) ||
    u.includes("captcha") ||
    u.includes("challenge") ||
    u.includes("bot") ||
    u.includes("verify")
  );
}

async function readBodyPreview(response: Response, limit = 400): Promise<string> {
  try {
    const ct = response.headers()["content-type"] || "";
    const text = await response.text();
    const trimmed = text.replace(/\s+/g, " ").trim();
    return `[${ct}] ${trimmed.slice(0, limit)}`;
  } catch {
    return "[unreadable body]";
  }
}

async function runSingle(mode: "headful" | "headless", plate: string): Promise<RunResult> {
  const browser: Browser = await chromium.launch({
    headless: mode === "headless",
    slowMo: mode === "headful" ? 250 : 0,
  });

  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();

  const result: RunResult = {
    mode,
    plate,
    apiHit: false,
    apiStatusCodes: [],
    got403: false,
    got429: false,
    recaptchaRequests: [],
    captchaLikeRequests: [],
    apiResponses: [],
    pageErrors: [],
    consoleWarnings: [],
    finalUrl: "",
    success: false,
  };

  page.on("pageerror", (err) => {
    result.pageErrors.push(String(err));
  });

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "warning" || type === "error") {
      result.consoleWarnings.push(`[${type}] ${msg.text()}`);
    }
  });

  page.on("request", (req: Request) => {
    const url = req.url();
    if (isRecaptchaUrl(url)) {
      result.recaptchaRequests.push(url);
    }
    if (isCaptchaLikeUrl(url)) {
      result.captchaLikeRequests.push(url);
    }
  });

  page.on("response", async (res: Response) => {
    const url = res.url();
    const status = res.status();

    if (status === 403) result.got403 = true;
    if (status === 429) result.got429 = true;

    if (url.includes(API_PATH)) {
      result.apiHit = true;
      result.apiStatusCodes.push(status);

      const contentType = res.headers()["content-type"] || "";
      const bodyPreview = await readBodyPreview(res);

      result.apiResponses.push({
        url,
        status,
        contentType,
        bodyPreview,
      });
    }
  });

  try {
    await page.goto(TARGET_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(1500);

    const input = page.locator("input").first();
    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill(plate);

    const apiPromise = page.waitForResponse(
      (res) =>
        res.url().includes(API_PATH) &&
        res.request().method() === "POST",
      { timeout: 30000 }
    ).catch(() => null);

    const button = page.getByRole("button").first();
    await button.click();

    const apiResponse = await apiPromise;

    result.finalUrl = page.url();
    const apiStatus = apiResponse?.status() ?? null;
    result.success =
      apiStatus !== null &&
      apiStatus >= 200 &&
      apiStatus < 300 &&
      !result.got403 &&
      !result.got429;

    if (!apiResponse && !result.errorMessage) {
      result.errorMessage = "No API response captured within timeout";
    } else if (!result.success && !result.errorMessage) {
      result.errorMessage = `API returned status ${apiStatus}`;
    }

    await page.screenshot({
      path: `anti-bot-${mode}.png`,
      fullPage: true,
    });
  } catch (err) {
    result.finalUrl = page.url();
    result.success = false;
    result.errorMessage = err instanceof Error ? err.message : String(err);

    try {
      await page.screenshot({
        path: `anti-bot-${mode}-error.png`,
        fullPage: true,
      });
    } catch {}
  } finally {
    await context.close();
    await browser.close();
  }

  return result;
}

function summarize(headful: RunResult, headless: RunResult) {
  const diff: string[] = [];

  if (headful.apiHit !== headless.apiHit) {
    diff.push(`apiHit differs: headful=${headful.apiHit}, headless=${headless.apiHit}`);
  }
  if (headful.got403 !== headless.got403) {
    diff.push(`403 differs: headful=${headful.got403}, headless=${headless.got403}`);
  }
  if (headful.got429 !== headless.got429) {
    diff.push(`429 differs: headful=${headful.got429}, headless=${headless.got429}`);
  }
  if ((headful.recaptchaRequests.length > 0) !== (headless.recaptchaRequests.length > 0)) {
    diff.push(
      `reCAPTCHA request presence differs: headful=${headful.recaptchaRequests.length > 0}, headless=${headless.recaptchaRequests.length > 0}`
    );
  }
  if (headful.success !== headless.success) {
    diff.push(`success differs: headful=${headful.success}, headless=${headless.success}`);
  }

  return {
    headful,
    headless,
    differences: diff,
  };
}

async function main() {
  const plate = process.argv[2] || "PEB264";

  console.log(`Running anti-bot diagnostics for plate: ${plate}`);

  const headful = await runSingle("headful", plate);
  const headless = await runSingle("headless", plate);

  const summary = summarize(headful, headless);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
