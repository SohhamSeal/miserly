// -----------------------------------------------------------------------------
// miserly — trust your corporate TLS-inspection CA (`npm run proxy:trust`).
//
// Many corporate networks (Cisco Secure Access, Zscaler, Netskope, Palo Alto…)
// intercept HTTPS and re-sign it with a company certificate. Your browser and
// curl trust it via the OS store, but Node ships its OWN certificate list and
// ignores the OS store — so the proxy's outbound calls fail with
// "unable to get local issuer certificate".
//
// This exports your machine's trusted roots to ~/.miserly/corp-ca.pem. The
// proxy auto-loads that file on startup (re-execing with NODE_EXTRA_CA_CERTS),
// so `npm run proxy` then just works. Re-run this if your company rotates its
// CA. Nothing here weakens TLS — it trusts exactly what your OS already trusts.
// -----------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const OUT = process.env.MISERLY_CA_CERTS ?? join(homedir(), ".miserly", "corp-ca.pem");

function collectMac() {
  const chunks = [];
  const sources = [
    "/Library/Keychains/System.keychain",
    "/System/Library/Keychains/SystemRootCertificates.keychain",
  ];
  for (const src of sources) {
    if (!existsSync(src)) continue;
    try {
      chunks.push(execFileSync("security", ["find-certificate", "-a", "-p", src], { encoding: "utf8" }));
    } catch {
      /* keychain unreadable — skip */
    }
  }
  return chunks.join("\n");
}

function collectLinux() {
  for (const p of [
    "/etc/ssl/certs/ca-certificates.crt", // Debian/Ubuntu
    "/etc/pki/tls/certs/ca-bundle.crt", // RHEL/Fedora
    "/etc/ssl/ca-bundle.pem", // SUSE
  ]) {
    if (existsSync(p)) {
      try {
        return execFileSync("cat", [p], { encoding: "utf8" });
      } catch {
        /* skip */
      }
    }
  }
  return "";
}

const os = platform();
let pem = "";
if (os === "darwin") pem = collectMac();
else if (os === "linux") pem = collectLinux();

const count = (pem.match(/BEGIN CERTIFICATE/g) ?? []).length;

if (count === 0) {
  console.error(`
✗ Couldn't find a system certificate store to export on this platform (${os}).

  If your network inspects TLS, export your corporate root/intermediate CA to a
  PEM manually and point the proxy at it:
      MISERLY_CA_CERTS=/path/to/corp-ca.pem npm run proxy
  (Windows: export the CA from certmgr.msc as Base-64 .cer, then use that path.)
`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pem);
console.log(`
✓ Exported ${count} trusted certificate(s) → ${OUT}

  \`npm run proxy\` will auto-load this and route through your corporate CA.
  Re-run \`npm run proxy:trust\` if your company rotates its certificate.
`);
