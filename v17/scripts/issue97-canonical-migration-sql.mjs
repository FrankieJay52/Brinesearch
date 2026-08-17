import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function canonicalizeMigrationSql(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error("migration SQL must not contain a UTF-8 BOM");
  }
  let sql = utf8.decode(bytes);
  sql = sql.replace(/\r\n/g, "\n");
  if (sql.includes("\r")) {
    throw new Error("migration SQL contains a bare carriage return");
  }
  sql = sql.replace(/\n+$/u, "") + "\n";
  return Buffer.from(sql, "utf8");
}

export function migrationSqlEvidence(input) {
  const canonical = canonicalizeMigrationSql(input);
  return {
    canonical,
    bytes: canonical.length,
    md5: crypto.createHash("md5").update(canonical).digest("hex"),
    sha256: crypto.createHash("sha256").update(canonical).digest("hex"),
    hex: canonical.toString("hex"),
  };
}

function main(argv) {
  const [command, inputPath, outputPath] = argv;
  if (command !== "render" || !inputPath || !outputPath || argv.length !== 3) {
    throw new Error("usage: node issue97-canonical-migration-sql.mjs render INPUT OUTPUT");
  }
  const evidence = migrationSqlEvidence(fs.readFileSync(inputPath));
  fs.writeFileSync(outputPath, evidence.canonical, { flag: "wx" });
  process.stdout.write([
    `CANONICAL_BYTES=${evidence.bytes}`,
    `CANONICAL_MD5=${evidence.md5}`,
    `CANONICAL_SHA256=${evidence.sha256}`,
    `CANONICAL_HEX=${evidence.hex}`,
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
