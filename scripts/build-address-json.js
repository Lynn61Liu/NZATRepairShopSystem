#!/usr/bin/env node
/*
  CSV -> JSON address shards

  Usage:
    node scripts/build-address-json.js --input "/path/to/csv-or-dir" --output "apps/shell/public/address" --address-column "full_address"

  Notes:
    - Splits by first two letters of the first alphabetic sequence in the address.
    - Writes one JSON array per prefix: address/ab.json
    - Emits address/index.json with counts.
*/

const fs = require("fs");
const path = require("path");
const readline = require("readline");

function parseArgs(argv) {
  const args = { input: "", output: "", addressColumn: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--input") args.input = next || "";
    if (key === "--output") args.output = next || "";
    if (key === "--address-column") args.addressColumn = next || "";
  }
  return args;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function normalizeAddress(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function getPrefix(address) {
  const match = address.toLowerCase().match(/[a-z]{2,}/);
  if (match && match[0]) return match[0].slice(0, 2);
  const letters = address.toLowerCase().match(/[a-z]/g);
  if (letters && letters.length >= 2) return letters[0] + letters[1];
  return "zz";
}

function pickAddressIndex(headers, explicitName) {
  if (!headers.length) return -1;
  if (explicitName) {
    const idx = headers.findIndex((h) => h.toLowerCase() === explicitName.toLowerCase());
    return idx;
  }
  const candidates = [
    "full_address",
    "fulladdress",
    "address",
    "full_address_ascii",
    "fulladdressascii",
  ];
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase() === c);
    if (idx >= 0) return idx;
  }
  const containsIdx = headers.findIndex((h) => h.toLowerCase().includes("address"));
  return containsIdx;
}

function collectCsvFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(inputPath)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => path.join(inputPath, name));
}

async function main() {
  const { input, output, addressColumn } = parseArgs(process.argv);
  if (!input || !output) {
    console.error("Missing --input or --output.");
    process.exit(1);
  }

  const inputPath = path.resolve(input);
  const outputDir = path.resolve(output);
  const tmpDir = path.join(outputDir, ".tmp_address_chunks");

  if (!fs.existsSync(inputPath)) {
    console.error(`Input path not found: ${inputPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const files = collectCsvFiles(inputPath);
  if (!files.length) {
    console.error("No CSV files found.");
    process.exit(1);
  }

  const streams = new Map();
  const counts = new Map();
  let total = 0;

  for (const file of files) {
    const inputStream = fs.createReadStream(file, { encoding: "utf8" });
    const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

    let headers = [];
    let addressIndex = -1;
    let isHeaderParsed = false;

    for await (const rawLine of rl) {
      const line = rawLine.replace(/\r$/, "");
      if (!line.trim()) continue;

      if (!isHeaderParsed) {
        const parsed = parseCsvLine(line);
        headers = parsed.map((h) => h.replace(/^\uFEFF/, "").trim());
        addressIndex = pickAddressIndex(headers, addressColumn);
        if (addressIndex < 0) {
          console.error(`Cannot find address column in ${file}`);
          process.exit(1);
        }
        isHeaderParsed = true;
        continue;
      }

      const row = parseCsvLine(line);
      const addressRaw = row[addressIndex];
      if (!addressRaw) continue;
      const address = normalizeAddress(addressRaw);
      if (!address) continue;

      const prefix = getPrefix(address);
      let stream = streams.get(prefix);
      if (!stream) {
        const tmpFile = path.join(tmpDir, `${prefix}.txt`);
        stream = fs.createWriteStream(tmpFile, { flags: "a" });
        streams.set(prefix, stream);
      }
      stream.write(address + "\n");
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
      total += 1;
    }
  }

  for (const stream of streams.values()) {
    await new Promise((resolve) => stream.end(resolve));
  }

  const index = {};
  let minCount = Infinity;
  let maxCount = 0;

  for (const [prefix, count] of counts.entries()) {
    const tmpFile = path.join(tmpDir, `${prefix}.txt`);
    const content = fs.readFileSync(tmpFile, "utf8");
    const list = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const unique = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
    fs.writeFileSync(path.join(outputDir, `${prefix}.json`), JSON.stringify(unique), "utf8");
    index[prefix] = unique.length;

    if (unique.length < minCount) minCount = unique.length;
    if (unique.length > maxCount) maxCount = unique.length;
  }

  fs.writeFileSync(path.join(outputDir, "index.json"), JSON.stringify(index), "utf8");

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`Total addresses: ${total}`);
  console.log(`Prefix files: ${Object.keys(index).length}`);
  console.log(`Min per file: ${Number.isFinite(minCount) ? minCount : 0}`);
  console.log(`Max per file: ${maxCount}`);
  console.log(`Output: ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
