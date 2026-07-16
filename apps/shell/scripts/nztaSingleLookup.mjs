import { chromium } from "playwright";

const TARGET_PAGE = "https://transact.nzta.govt.nz/v2/check-expiry";
const API_PATH = "/v2/api/vehicles/expiry/details";
const input = JSON.parse(process.argv[2] || "{}");
const plate = String(input.plate || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const profilePath = String(input.profilePath || "").trim();
const timeoutMs = Math.max(60_000, Number(input.timeoutMs || 180_000));

function write(payload) {
  process.stdout.write(JSON.stringify(payload));
}

if (!plate || !profilePath) {
  write({ success: false, status: 400, error: "Missing NZTA plate or browser profile path." });
  process.exit(0);
}

let context;

async function installCapture(page) {
  await page.addInitScript((apiPath) => {
    window.__nztaExpiryFetchCapture = { done: false, status: null, text: "", error: null };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const requestUrl = typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : String(args[0]);
        if (requestUrl.includes(apiPath)) {
          window.__nztaExpiryFetchCapture = {
            done: true,
            status: response.status,
            text: await response.clone().text(),
            error: null,
          };
        }
      } catch (error) {
        window.__nztaExpiryFetchCapture = {
          done: true,
          status: null,
          text: "",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      return response;
    };
  }, API_PATH);
}

async function waitForRecaptcha(page, waitMs) {
  return page.waitForFunction(() => {
    const textareas = Array.from(document.querySelectorAll('textarea[name="g-recaptcha-response"]'));
    if (textareas.some((item) => item.value.trim().length > 20)) return true;
    const direct = window.grecaptcha?.getResponse?.() || "";
    const enterprise = window.grecaptcha?.enterprise?.getResponse?.() || "";
    return direct.trim().length > 20 || enterprise.trim().length > 20;
  }, { timeout: waitMs, polling: 500 }).then(() => true).catch(() => false);
}

async function runAttempt(page, attempt) {
  await page.goto(TARGET_PAGE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const plateInput = page.locator("#plate");
  await plateInput.waitFor({ state: "visible", timeout: 30_000 });
  await plateInput.fill(plate);

  // Keep the real window available so the user can interact when NZTA asks for verification.
  await waitForRecaptcha(page, attempt === 1 ? 45_000 : 75_000);

  const capturePromise = page.waitForFunction(
    () => window.__nztaExpiryFetchCapture?.done === true,
    { timeout: 45_000 },
  );
  const continueButton = page.getByText("Continue", { exact: true });
  if (await continueButton.count()) {
    await continueButton.first().click();
  } else {
    await page.locator("button,input[type=submit]").first().click();
  }

  await capturePromise;
  return page.evaluate(() => window.__nztaExpiryFetchCapture);
}

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: "chrome",
    headless: false,
    locale: "en-NZ",
    viewport: null,
    slowMo: 100,
    args: ["--window-size=1100,820", "--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(Math.min(timeoutMs, 60_000));
  await installCapture(page);

  let result = await runAttempt(page, 1);
  if (result?.status === 401 && String(result.text || "").toLowerCase().includes("recaptcha")) {
    await page.waitForTimeout(10_000);
    result = await runAttempt(page, 2);
  }

  if (result?.error) {
    write({ success: false, status: 500, error: `NZTA response capture failed: ${result.error}` });
  } else if (!result || result.status < 200 || result.status >= 300) {
    const captchaFailure = result?.status === 401 && String(result.text || "").toLowerCase().includes("recaptcha");
    write({
      success: false,
      status: result?.status || 500,
      error: captchaFailure
        ? "NZTA verification was not accepted. Please interact with the dedicated Chrome window and try again."
        : `NZTA API returned status ${result?.status || "unknown"}.`,
      text: String(result?.text || "").slice(0, 2000),
    });
  } else {
    write({ success: true, status: result.status, text: result.text });
  }
} catch (error) {
  write({ success: false, status: 500, error: error instanceof Error ? error.message : String(error) });
} finally {
  await context?.close().catch(() => undefined);
}
