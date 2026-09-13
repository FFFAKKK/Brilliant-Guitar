// Run from the repository root. Keep the guest outside the seven host crates.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const readsV2 = process.argv[2] === "--core-reads-v2";
if (process.argv.length !== (readsV2 ? 3 : 2)) throw new Error("usage: build.mjs [--core-reads-v2]");
execFileSync("cargo", ["+1.88.0", "build", "--manifest-path", "test/core-kernel/fixtures/wasm-guest/Cargo.toml",
  ...(readsV2 ? ["--example", "scoped_reads_v2"] : []),
  "--target", "wasm32-unknown-unknown", "--target-dir", "target/wasm-guest", "--release", "--locked", "--offline"], { stdio: "inherit" });
const bytes = readFileSync(`target/wasm-guest/wasm32-unknown-unknown/release/${readsV2 ? "examples/scoped_reads_v2" : "kernel_scoped_wasm_fixture"}.wasm`);
let offset = 8;
function readU32() {
  let value = 0, shift = 0, byte;
  do { byte = bytes[offset++]; value |= (byte & 127) << shift; shift += 7; } while (byte & 128);
  return value >>> 0;
}
function u32(value) {
  const out = [];
  do { const byte = value & 127; value >>>= 7; out.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from(out);
}
const sections = [bytes.subarray(0, 8)];
while (offset < bytes.length) {
  const start = offset, id = bytes[offset++], length = readU32(), end = offset + length;
  if (id !== 7) { sections.push(bytes.subarray(start, end)); offset = end; continue; }
  const entries = [], count = readU32();
  for (let i = 0; i < count; i++) {
    const entryStart = offset, nameLength = readU32();
    const name = bytes.toString("utf8", offset, offset + nameLength);
    offset += nameLength;
    const kind = bytes[offset++];
    readU32();
    // Rust exports linker layout globals which the guest ABI intentionally hides.
    if (kind === 3 && ["__data_end", "__heap_base"].includes(name)) continue;
    entries.push(bytes.subarray(entryStart, offset));
  }
  if (offset !== end) throw new Error("invalid export section");
  const payload = Buffer.concat([u32(entries.length), ...entries]);
  sections.push(Buffer.from([7]), u32(payload.length), payload);
}
const guest = Buffer.concat(sections), module = new WebAssembly.Module(guest);
if (WebAssembly.Module.imports(module).length || WebAssembly.Module.exports(module).map(e => e.name).sort().join() !==
  "brilliant_alloc_v1,brilliant_execute_v1,memory") throw new Error("unexpected guest ABI");
const destination = `test/core-kernel/fixtures/wasm-guest/${readsV2 ? "guest-v2" : "guest"}.wasm`;
if (!readsV2 && existsSync(destination) && !readFileSync(destination).equals(guest)) {
  writeFileSync("target/wasm-guest/rebuilt-v1-candidate.wasm", guest);
  throw new Error("Archived V1 guest bytes differ from the current-source rebuild; kept guest.wasm unchanged. Inspect target/wasm-guest/rebuilt-v1-candidate.wasm.");
}
writeFileSync(destination, guest);
