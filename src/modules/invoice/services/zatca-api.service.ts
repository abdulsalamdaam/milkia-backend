import { Injectable, Logger } from "@nestjs/common";
import { request as httpsRequest } from "node:https";

/**
 * ZATCA gateway URL layout. Same host serves all environments — only the
 * path prefix differs:
 *   /developer-portal — sandbox (test certs)
 *   /simulation       — pre-production
 *   /core             — production (live invoices)
 *
 * See https://sandbox.zatca.gov.sa/ for credentials. Production keys are
 * issued through Fatoora Portal after a successful simulation pass.
 */
const HOST = "gw-fatoora.zatca.gov.sa";
const PREFIXES = {
  sandbox: "/e-invoicing/developer-portal",
  simulation: "/e-invoicing/simulation",
  production: "/e-invoicing/core",
} as const;

export const SANDBOX_OTP = "123456";

export type ZatcaEnv = keyof typeof PREFIXES;

export interface ZatcaResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  raw: string;
  json: T | null;
}

@Injectable()
export class ZatcaApiService {
  private readonly logger = new Logger(ZatcaApiService.name);

  private request<T = unknown>(opts: {
    host?: string;
    path: string;
    method: string;
    headers: Record<string, string | number>;
    body?: unknown;
  }): Promise<ZatcaResponse<T>> {
    return new Promise((resolve, reject) => {
      const host = opts.host || HOST;
      const bodyBuf =
        opts.body == null
          ? null
          : Buffer.from(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body), "utf8");
      const finalHeaders: Record<string, string | number> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bodyBuf ? { "Content-Length": bodyBuf.length } : {}),
        ...opts.headers,
      };
      if (process.env.ZATCA_DEBUG) {
        this.logger.debug(`${opts.method} https://${host}${opts.path}`);
      }
      const req = httpsRequest(
        { host, port: 443, path: opts.path, method: opts.method, headers: finalHeaders, timeout: 30_000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let json: T | null = null;
            try {
              json = raw ? (JSON.parse(raw) as T) : null;
            } catch {
              /* leave as null */
            }
            resolve({ status: res.statusCode || 0, headers: res.headers, raw, json });
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("request timeout")));
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  private basicAuth(username: string, password: string): string {
    return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  }

  /* ------------------------------------------------------------------- */
  /* Onboarding                                                          */
  /* ------------------------------------------------------------------- */

  /**
   * POST /compliance with the CSR and an OTP — returns the Compliance CSID
   * (binarySecurityToken + secret + complianceRequestId). Sandbox OTP is the
   * fixed string "123456"; production is delivered to the seller out-of-band
   * through Fatoora portal.
   */
  getComplianceCsid(args: { csrBase64: string; otp?: string; environment?: ZatcaEnv }) {
    const env = args.environment || "sandbox";
    return this.request<{
      requestID?: string;
      dispositionMessage?: string;
      binarySecurityToken: string;
      secret: string;
    }>({
      path: `${PREFIXES[env]}/compliance`,
      method: "POST",
      headers: { OTP: args.otp ?? SANDBOX_OTP, "Accept-Version": "V2" },
      body: { csr: args.csrBase64 },
    });
  }

  /**
   * Promote a compliance CSID to a production CSID. Run only after passing
   * the compliance test cycle (3+ invoices each: standard, simplified, debit,
   * credit) on the same compliance CSID.
   */
  getProductionCsid(args: {
    binarySecurityToken: string;
    secret: string;
    complianceRequestId: string;
    environment?: ZatcaEnv;
  }) {
    const env = args.environment || "sandbox";
    return this.request<{
      requestID?: string;
      binarySecurityToken: string;
      secret: string;
    }>({
      path: `${PREFIXES[env]}/production/csids`,
      method: "POST",
      headers: {
        Authorization: this.basicAuth(args.binarySecurityToken, args.secret),
        "Accept-Version": "V2",
      },
      body: { compliance_request_id: args.complianceRequestId },
    });
  }

  /* ------------------------------------------------------------------- */
  /* Invoice submission                                                  */
  /* ------------------------------------------------------------------- */

  complianceInvoice(args: SubmitArgs) {
    return this.request({
      path: `${PREFIXES[args.environment ?? "sandbox"]}/compliance/invoices`,
      method: "POST",
      headers: {
        Authorization: this.basicAuth(args.binarySecurityToken, args.secret),
        "Accept-Version": "V2",
        "Accept-Language": "en",
      },
      body: this.invoiceBody(args),
    });
  }

  reportInvoice(args: SubmitArgs) {
    return this.request({
      path: `${PREFIXES[args.environment ?? "sandbox"]}/invoices/reporting/single`,
      method: "POST",
      headers: {
        Authorization: this.basicAuth(args.binarySecurityToken, args.secret),
        "Accept-Version": "V2",
        "Clearance-Status": "0",
        "Accept-Language": "en",
      },
      body: this.invoiceBody(args),
    });
  }

  clearInvoice(args: SubmitArgs) {
    return this.request({
      path: `${PREFIXES[args.environment ?? "sandbox"]}/invoices/clearance/single`,
      method: "POST",
      headers: {
        Authorization: this.basicAuth(args.binarySecurityToken, args.secret),
        "Accept-Version": "V2",
        "Clearance-Status": "1",
        "Accept-Language": "en",
      },
      body: this.invoiceBody(args),
    });
  }

  private invoiceBody(args: SubmitArgs) {
    return {
      invoiceHash: args.invoiceHash,
      uuid: args.uuid,
      invoice: Buffer.from(args.signedXml, "utf8").toString("base64"),
    };
  }
}

export interface SubmitArgs {
  binarySecurityToken: string;
  secret: string;
  invoiceHash: string;
  uuid: string;
  signedXml: string;
  environment?: ZatcaEnv;
}
