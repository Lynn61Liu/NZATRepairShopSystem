import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import { Client, type ClientConfig } from "pg";

const TARGET_PAGE = "https://transact.nzta.govt.nz/v2/Check-Expiry";
const API_PATH = "/v2/api/vehicles/expiry/details";
const MAX_CONSECUTIVE_FAILURES = 2;
const CANDIDATE_BATCH_SIZE = 20;
const DEFAULT_WINDOW_WIDTH = 1100;
const DEFAULT_WINDOW_HEIGHT = 820;
const PAGE_SETTLE_DELAY_MS = [1000, 3000] as const;
const BEFORE_TYPING_DELAY_MS = [500, 1800] as const;
const KEYSTROKE_DELAY_MS = [80, 220] as const;
const BEFORE_SUBMIT_DELAY_MS = [800, 2200] as const;
const BETWEEN_LOOKUPS_DELAY_MS = [25000, 75000] as const;
const RECAPTCHA_RETRY_DELAY_MS = [60000, 180000] as const;
const BATCH_BREAK_EVERY = 6;
const BATCH_BREAK_DELAY_MS = [120000, 240000] as const;
const LOG_FILE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "logs",
  "nzta-vehicle-sync.log",
);
const BROWSER_PROFILE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "logs",
  "playwright",
  "nzta-profile",
);
const RECAPTCHA_READY_TIMEOUT_MS = 45000;
const RECAPTCHA_READY_POLL_MS = 500;
const MANUAL_WARMUP_TIMEOUT_MS = 180000;
const SKIPPED_PLATE_PATTERNS: string[] = ["RQL113", "AB980", "NCZ326", "756", "MPE194", "NWM435", "NPP113", "PAT359"];

type PendingVehicle = {
  id: number;
  plate: string;
};

type DatabaseConfig = ClientConfig;

type VehiclePayload = {
  latestInspectionDetails?: {
    expiryDate?: string | null;
  } | null;
  latestLicenceDetails?: {
    expiryDate?: string | null;
  } | null;
  latestRUCDetails?: {
    hasCurrentRUCLicence?: boolean | null;
    rucLicenceNumber?: number | null;
    endDistance?: number | null;
  } | null;
};

type ResolvedData = {
  wofExpiry: string | null;
  licenceExpiry: string | null;
  rucLicenceNumber: number;
  rucEndDistance: number;
};

type CapturedApiResult = {
  done: boolean;
  status: number | null;
  json: unknown;
  error: string | null;
};

type LookupUpdateResult = {
  resolved: ResolvedData;
  rows: number;
};

const attemptedIds = new Set<number>();
let logWriteChain = Promise.resolve();

class RecaptchaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecaptchaValidationError";
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepRandom(range: readonly [number, number]): Promise<number> {
  const delay = randomInt(range[0], range[1]);
  await sleep(delay);
  return delay;
}

async function logAndSleep(label: string, range: readonly [number, number]): Promise<number> {
  const delay = randomInt(range[0], range[1]);
  log(`${label} ${delay}ms.`);
  await sleep(delay);
  return delay;
}

async function processVehicleLookup(
  page: Page,
  dbConfig: DatabaseConfig,
  vehicle: PendingVehicle,
): Promise<LookupUpdateResult> {
  const payload = await fetchVehicleDetails(page, vehicle.plate);
  const resolved = resolveData(payload);
  if (!hasResolvedVehicleInfo(resolved) && !SKIPPED_PLATE_PATTERNS.includes(vehicle.plate)) {
    SKIPPED_PLATE_PATTERNS.push(vehicle.plate);
    log(`Added plate ${vehicle.plate} to SKIPPED_PLATE_PATTERNS after lookup returned no valid WOF/licence/RUC data.`);
  }
  const rows = await updateVehicle(dbConfig, vehicle, resolved);
  return { resolved, rows };
}

async function createBrowserContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    slowMo: 150,
    locale: "en-NZ",
    viewport: null,
    args: [
      `--window-size=${DEFAULT_WINDOW_WIDTH},${DEFAULT_WINDOW_HEIGHT}`,
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

async function main() {
  const dbConfig = await resolveConnectionString();
  log(`Using database connection from config/env.`);
  log(`Writing logs to ${LOG_FILE_PATH}`);
  log(`Using persistent browser profile at ${BROWSER_PROFILE_DIR}`);

  const context: BrowserContext = await createBrowserContext();
  await warmupRecaptchaContext(context);

  let consecutiveFailures = 0;
  let processedCount = 0;
  let updatedCount = 0;

  try {
    while (true) {
      const vehicle = await loadNextPendingVehicle(dbConfig);
      if (!vehicle ) {
        log("No pending vehicle found. Stopping.or ");
        break;

      }
      if (vehicle.plate.length > 8 || SKIPPED_PLATE_PATTERNS.some((pattern) => vehicle.plate.includes(pattern))) {
        log(`Skipping vehicle id==${vehicle.id} with invalid plate length (${vehicle.plate.length} chars): ${vehicle.plate}`);
        attemptedIds.add(vehicle.id);
        continue;
      }

      attemptedIds.add(vehicle.id);
      log(`Processing vehicle id==${vehicle.id} plate= ${vehicle.plate}`);

      const page = await context.newPage();
      try {
        const { resolved, rows } = await processVehicleLookup(page, dbConfig, vehicle);

        processedCount += 1;
        updatedCount += rows;
        consecutiveFailures = 0;

        log(
          [
            `Updated vehicle ${vehicle.id} plate ${vehicle.plate}`,
            `wof_expiry=${resolved.wofExpiry ?? "null"}`,
            `licence_expiry=${resolved.licenceExpiry ?? "null"}`,
            `ruc_licence_number=${resolved.rucLicenceNumber}`,
            `ruc_end_distance=${resolved.rucEndDistance}`,
            `rows=${rows}`,
          ].join(" | "),
        );

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (error instanceof RecaptchaValidationError) {
          consecutiveFailures += 1;
          await saveFailureScreenshot(page, vehicle.plate, "captcha-blocked");
          log(
            `Failed vehicle ${vehicle.id} plate ${vehicle.plate} | consecutiveFailures=${consecutiveFailures} | ${message}`,
          );

          await logAndSleep(
            `reCAPTCHA validation failed for plate ${vehicle.plate}. Cooling down before retrying with a fresh page for`,
            RECAPTCHA_RETRY_DELAY_MS,
          );

          const retryPage = await context.newPage();
          try {
            log(`Retrying vehicle ${vehicle.id} plate ${vehicle.plate} with a fresh page after cooldown.`);
            const { resolved, rows } = await processVehicleLookup(retryPage, dbConfig, vehicle);

            processedCount += 1;
            updatedCount += rows;
            consecutiveFailures = 0;

            log(
              [
                `Updated vehicle ${vehicle.id} plate ${vehicle.plate} after manual reCAPTCHA retry`,
                `wof_expiry=${resolved.wofExpiry ?? "null"}`,
                `licence_expiry=${resolved.licenceExpiry ?? "null"}`,
                `ruc_licence_number=${resolved.rucLicenceNumber}`,
                `ruc_end_distance=${resolved.rucEndDistance}`,
                `rows=${rows}`,
              ].join(" | "),
            );
          } catch (retryError) {
            const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
            const retryReason = retryError instanceof RecaptchaValidationError ? "captcha-blocked-retry" : "lookup-error-retry";

            await saveFailureScreenshot(page, vehicle.plate, retryReason);
            log(
              `Retry failed for vehicle ${vehicle.id} plate ${vehicle.plate} | consecutiveFailures=${consecutiveFailures} | ${retryMessage}`,
            );
            log("Stopping after fresh-page reCAPTCHA retry failed.");
            break;
          } finally {
            await retryPage.close().catch(() => undefined);
          }

          continue;
        }

        consecutiveFailures += 1;
        await saveFailureScreenshot(page, vehicle.plate, "lookup-error");
        log(
          `Failed vehicle ${vehicle.id} plate ${vehicle.plate} | consecutiveFailures=${consecutiveFailures} | ${message}`,
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          log(`Reached ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Stopping.`);
          break;
        }
      } finally {
        await page.close().catch(() => undefined);
      }

      await logAndSleep("Cooldown before next lookup", BETWEEN_LOOKUPS_DELAY_MS);
      if (processedCount > 0 && processedCount % BATCH_BREAK_EVERY === 0) {
        await logAndSleep("Taking an extended batch break for", BATCH_BREAK_DELAY_MS);
      }
    }
  } finally {
    await context.close();
    log(`Finished. processed=${processedCount} updated=${updatedCount} failed=${consecutiveFailures}`);
    await flushLogs();
  }
}

async function resolveConnectionString(): Promise<DatabaseConfig> {
  const envConnection = process.env.DB_CONN_STRING || process.env.ConnectionStrings__Default;
  if (envConnection?.trim()) {
    return toDatabaseConfig(envConnection.trim());
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const configPaths = [
    path.join(repoRoot, "backend", "Workshop.Api", "appsettings.Development.json"),
    path.join(repoRoot, "backend", "Workshop.Api", "appsettings.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const text = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(text) as { ConnectionStrings?: { Default?: string } };
      const connection = parsed.ConnectionStrings?.Default;
      if (connection?.trim()) {
        return toDatabaseConfig(connection.trim());
      }
    } catch {
      continue;
    }
  }

  throw new Error("Could not resolve database connection string from env or appsettings.");
}

function toDatabaseConfig(connectionString: string): DatabaseConfig {
  const pairs = connectionString
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf("=");
      return idx >= 0 ? [part.slice(0, idx).trim().toLowerCase(), part.slice(idx + 1).trim()] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null);

  const values = new Map(pairs);
  const port = values.get("port");

  return {
    host: values.get("host"),
    port: port ? Number(port) : undefined,
    database: values.get("database") ?? values.get("dbname"),
    user: values.get("username") ?? values.get("user"),
    password: values.get("password"),
  };
}

async function loadNextPendingVehicle(dbConfig: DatabaseConfig): Promise<PendingVehicle | null> {
  const sql = `
    select id, plate
    from vehicles
    where coalesce(trim(plate), '') <> ''
      and (
        wof_expiry is null
        or licence_expiry is null
        or ruc_licence_number is null
        or ruc_end_distance is null
      )
    order by id desc
    limit ${CANDIDATE_BATCH_SIZE};
  `;

  const candidates = await queryRows<PendingVehicle>(dbConfig, sql);

  return candidates.find((candidate) => !attemptedIds.has(candidate.id)) ?? null;
}

async function fetchVehicleDetails(page: Page, plate: string): Promise<VehiclePayload> {
  await installFetchHook(page);
  await installStealthScript(page);

  await page.goto(TARGET_PAGE, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // The page can keep long-lived requests open; continue with explicit element waits.
  }

  await sleepRandom(PAGE_SETTLE_DELAY_MS);

  const form = page.locator("form").first();
  await form.waitFor({ state: "visible", timeout: 15000 });

  const plateLabel = page.locator('label[for="plate"]').first();
  await plateLabel.waitFor({ state: "visible", timeout: 15000 });

  const input = page.locator("#plate");
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.waitFor({ state: "attached", timeout: 15000 });
  await expectEditable(input, 15000);
  await sleepRandom(BEFORE_TYPING_DELAY_MS);
  await input.click();
  await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await input.press("Backspace");
  await page.keyboard.type(plate, { delay: randomInt(KEYSTROKE_DELAY_MS[0], KEYSTROKE_DELAY_MS[1]) });
  const recaptchaReady = await waitForRecaptchaReady(page, plate);

  const continueButton = page.getByText("Continue", { exact: true });
  if ((await continueButton.count()) > 0) {
    await continueButton.first().waitFor({ state: "visible", timeout: 15000 });
    if (!recaptchaReady) {
      await logAndSleep(
        `reCAPTCHA token still missing for plate ${plate}. Waiting a little longer before submit for`,
        [12000, 22000] as const,
      );
    }
    await sleepRandom(BEFORE_SUBMIT_DELAY_MS);
    await continueButton.first().click();
  } else {
    const fallbackButton = page.getByRole("button", { name: /continue/i }).first();
    await fallbackButton.waitFor({ state: "visible", timeout: 15000 });
    if (!recaptchaReady) {
      await logAndSleep(
        `reCAPTCHA token still missing for plate ${plate}. Waiting a little longer before submit for`,
        [12000, 22000] as const,
      );
    }
    await sleepRandom(BEFORE_SUBMIT_DELAY_MS);
    await fallbackButton.click();
  }

  const captured = await waitForCapturedResult(page);
  const bodyPreview = truncate(JSON.stringify(captured.json), 300);

  if (captured.error) {
    throw new Error(`Fetch hook failed: ${captured.error}`);
  }

  if (captured.status === 401 && typeof captured.json === "string" && captured.json.toLowerCase().includes("google recaptcha validation failed")) {
    throw new RecaptchaValidationError(`API returned status 401 body=${bodyPreview}`);
  }

  if (captured.status === null || captured.status < 200 || captured.status >= 300) {
    throw new Error(`API returned status ${captured.status ?? "unknown"} body=${bodyPreview}`);
  }

  return captured.json as VehiclePayload;
}

async function installStealthScript(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      configurable: true,
      get: () => undefined,
    });

    Object.defineProperty(navigator, "languages", {
      configurable: true,
      get: () => ["en-NZ", "en-US", "en"],
    });

    Object.defineProperty(navigator, "plugins", {
      configurable: true,
      get: () => [
        { name: "Chrome PDF Plugin" },
        { name: "Chrome PDF Viewer" },
        { name: "Native Client" },
      ],
    });
  });
}

async function warmupRecaptchaContext(context: BrowserContext) {
  const warmupPage = await context.newPage();
  try {
    await installStealthScript(warmupPage);
    await warmupPage.goto(TARGET_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    log(
      `Opened NZTA warmup page in Chrome profile. For the next ${Math.round(MANUAL_WARMUP_TIMEOUT_MS / 1000)}s, interact with the page once if it is visible so reCAPTCHA can score the session.`,
    );

    const warmupReady = await waitForRecaptchaReady(warmupPage, "warmup", MANUAL_WARMUP_TIMEOUT_MS);
    if (warmupReady) {
      log("Warmup reCAPTCHA token detected. Continuing with vehicle lookups.");
    } else {
      log("Warmup token was not detected. Continuing anyway with the warmed browser session.");
    }
  } finally {
    await warmupPage.close().catch(() => undefined);
  }
}

async function installFetchHook(page: Page) {
  await page.addInitScript((apiPath: string) => {
    const stateKey = "__nztaExpiryFetchCapture";
    const runtimeWindow = window as unknown as Window & { [key: string]: unknown };
    runtimeWindow[stateKey] = {
      done: false,
      status: null,
      json: null,
      error: null,
    };

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
          const clone = response.clone();
          let parsed: unknown = null;
          let error: string | null = null;

          try {
            parsed = await clone.json();
          } catch (fetchError) {
            error = fetchError instanceof Error ? fetchError.message : String(fetchError);
          }

          runtimeWindow[stateKey] = {
            done: true,
            status: response.status,
            json: parsed,
            error,
          };
        }
      } catch (hookError) {
        runtimeWindow[stateKey] = {
          done: true,
          status: null,
          json: null,
          error: hookError instanceof Error ? hookError.message : String(hookError),
        };
      }

      return response;
    };
  }, API_PATH);
}

async function waitForRecaptchaReady(
  page: Page,
  plate: string,
  timeoutMs = RECAPTCHA_READY_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const token = await page.waitForFunction(
      () => {
        const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[name="g-recaptcha-response"]'));
        for (const textarea of textareas) {
          const value = textarea.value.trim();
          if (value.length > 20) {
            return value;
          }
        }

        const runtimeWindow = window as Window & {
          grecaptcha?: {
            getResponse?: () => string;
            enterprise?: {
              getResponse?: () => string;
            };
          };
        };

        const directResponse = runtimeWindow.grecaptcha?.getResponse?.() ?? "";
        if (directResponse.trim().length > 20) {
          return directResponse.trim();
        }

        const enterpriseResponse = runtimeWindow.grecaptcha?.enterprise?.getResponse?.() ?? "";
        if (enterpriseResponse.trim().length > 20) {
          return enterpriseResponse.trim();
        }

        return null;
      },
      { timeout: timeoutMs, polling: RECAPTCHA_READY_POLL_MS },
    );

    const tokenPreview = await token.jsonValue() as string | null;
    log(`reCAPTCHA token detected for ${plate} (length=${tokenPreview?.length ?? 0}).`);
    return true;
  } catch {
    log(
      `No reCAPTCHA token detected for ${plate} within ${timeoutMs}ms. Continuing anyway in case NZTA executes captcha on submit.`,
    );
    return false;
  }
}

async function waitForCapturedResult(page: Page): Promise<CapturedApiResult> {
  await page.waitForFunction(() => {
    const state = (window as Window & { __nztaExpiryFetchCapture?: { done?: boolean } }).__nztaExpiryFetchCapture;
    return state?.done === true;
  }, { timeout: 30000 });

  return page.evaluate(() => {
    const state = (window as Window & { __nztaExpiryFetchCapture?: CapturedApiResult }).__nztaExpiryFetchCapture;
    return state ?? {
      done: false,
      status: null,
      json: null,
      error: "Fetch capture state missing",
    };
  });
}

async function saveFailureScreenshot(page: Page, plate: string, reason: string) {
  const screenshotDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "logs",
    "screenshots",
  );
  await fs.mkdir(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filePath = path.join(screenshotDir, `${timestamp}-${plate}-${reason}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => undefined);
  log(`Saved failure screenshot to ${filePath}`);
}

async function expectEditable(locator: ReturnType<Page["locator"]>, timeoutMs: number) {
  await locator.page().waitForFunction(
    (selector) => {
      const element = document.querySelector<HTMLInputElement>(selector);
      if (!element) {
        return false;
      }

      const style = window.getComputedStyle(element);
      return !element.disabled &&
        !element.readOnly &&
        style.visibility !== "hidden" &&
        style.display !== "none";
    },
    "#plate",
    { timeout: timeoutMs },
  );
}

function resolveData(payload: VehiclePayload): ResolvedData {
  const wofExpiry = toDateOnly(payload.latestInspectionDetails?.expiryDate);
  const licenceExpiry = toDateOnly(payload.latestLicenceDetails?.expiryDate);

  const hasCurrentRuc = payload.latestRUCDetails?.hasCurrentRUCLicence === true;
  const rucLicenceNumber = hasCurrentRuc ? Number(payload.latestRUCDetails?.rucLicenceNumber ?? 0) : 0;
  const rucEndDistance = hasCurrentRuc ? Number(payload.latestRUCDetails?.endDistance ?? 0) : 0;

  if (!wofExpiry && !licenceExpiry && !hasCurrentRuc) {
    log("Lookup returned no current WOF/licence/RUC values; writing zeroed RUC fields and null expiries.");
  }

  return {
    wofExpiry,
    licenceExpiry,
    rucLicenceNumber: Number.isFinite(rucLicenceNumber) ? rucLicenceNumber : 0,
    rucEndDistance: Number.isFinite(rucEndDistance) ? rucEndDistance : 0,
  };
}

function hasResolvedVehicleInfo(data: ResolvedData): boolean {
  return Boolean(data.wofExpiry || data.licenceExpiry || data.rucLicenceNumber > 0 || data.rucEndDistance > 0);
}

async function updateVehicle(dbConfig: DatabaseConfig, vehicle: PendingVehicle, data: ResolvedData): Promise<number> {
  const sql = `
    update vehicles
    set
      wof_expiry = ${sqlDateLiteral(data.wofExpiry)},
      licence_expiry = ${sqlDateLiteral(data.licenceExpiry)},
      ruc_licence_number = ${data.rucLicenceNumber},
      ruc_end_distance = ${data.rucEndDistance},
      updated_at = now()
    where id = ${vehicle.id}
      and plate = ${sqlTextLiteral(vehicle.plate)};
  `;

  return executeStatement(dbConfig, sql);
}

async function queryRows<T extends Record<string, unknown>>(dbConfig: DatabaseConfig, sql: string): Promise<T[]> {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

async function executeStatement(dbConfig: DatabaseConfig, sql: string): Promise<number> {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

function sqlTextLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlDateLiteral(value: string | null): string {
  return value ? `'${value}'::date` : "null";
}

function toDateOnly(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  logWriteChain = logWriteChain.then(async () => {
    await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
    await fs.appendFile(LOG_FILE_PATH, `${line}\n`, "utf8");
  }).catch(() => undefined);
}

main().catch((error) => {
  log(error instanceof Error ? error.stack ?? error.message : String(error));
  flushLogs().finally(() => process.exit(1));
});

async function flushLogs() {
  await logWriteChain;
}
