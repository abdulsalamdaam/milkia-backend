import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ShellService } from "./shell.service";
import { ZATCA_CSR_TEMPLATE } from "./zatca-assets";

const TEMPLATE_NAMES: Record<string, string> = {
  sandbox: "TSTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  production: "ZATCA-Code-Signing",
};

export interface CsrConfig {
  commonName: string;
  serialNumber: string;
  organizationIdentifier: string;
  organizationUnitName: string;
  organizationName: string;
  countryName?: string;
  invoiceType?: string;
  locationAddress: string;
  industryCategory: string;
  environment: "sandbox" | "simulation" | "production";
}

export interface CsrResult {
  privateKey: string;
  csr: string;
  csrBase64: string;
  publicKey: string;
}

/**
 * Strip BEGIN/END lines + whitespace from a PEM block, leaving the raw base64
 * body. Used to derive cert hashes / pull DER bytes back out.
 */
export function pemBody(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

@Injectable()
export class CsrService {
  constructor(private readonly shell: ShellService) {}

  /**
   * Generate an EC secp256k1 keypair and a ZATCA-formatted CSR. ZATCA wants
   * `secp256k1` (not P-256) and a specific OID layout in the SAN to identify
   * the EGS unit. The template (assets/zatca/openssl-csr-template.cnf) carries
   * those fixed bits; this function fills the per-seller variables.
   */
  async generateCsr(config: CsrConfig): Promise<CsrResult> {
    const env = config.environment || "sandbox";
    const templateName = TEMPLATE_NAMES[env];
    if (!templateName) throw new Error(`unknown environment: ${env}`);

    const filled = ZATCA_CSR_TEMPLATE
      .replace("{TEMPLATE_NAME}", templateName)
      .replace("{SERIAL_NUMBER}", config.serialNumber)
      .replace("{ORG_IDENTIFIER}", config.organizationIdentifier)
      .replace("{INVOICE_TYPE}", config.invoiceType || "1100")
      .replace("{LOCATION_ADDRESS}", config.locationAddress)
      .replace("{INDUSTRY_CATEGORY}", config.industryCategory)
      .replace("{COUNTRY}", config.countryName || "SA")
      .replace("{ORG_UNIT}", config.organizationUnitName)
      .replace("{ORG_NAME}", config.organizationName)
      .replace("{COMMON_NAME}", config.commonName);

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zatca-csr-"));
    const cnfPath = path.join(tmp, "csr.cnf");
    const keyPath = path.join(tmp, "key.pem");
    const csrPath = path.join(tmp, "csr.pem");

    try {
      await fs.writeFile(cnfPath, filled, "utf8");

      await this.shell.mustRun("openssl", ["ecparam", "-name", "secp256k1", "-genkey", "-noout", "-out", keyPath]);
      const privateKey = await fs.readFile(keyPath, "utf8");

      await this.shell.mustRun("openssl", ["req", "-new", "-sha256", "-key", keyPath, "-config", cnfPath, "-out", csrPath]);
      const csr = await fs.readFile(csrPath, "utf8");

      const pub = await this.shell.mustRun("openssl", ["ec", "-in", keyPath, "-pubout"]);
      const publicKey = pub.stdout as string;

      // ZATCA wants base64 of the **whole PEM** (BEGIN/END lines included), not just the inner body.
      const csrBase64 = Buffer.from(csr, "utf8").toString("base64");

      return { privateKey, csr, csrBase64, publicKey };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}
