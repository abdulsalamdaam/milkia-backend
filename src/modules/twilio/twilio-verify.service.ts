import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export type VerifyChannel = "sms" | "call" | "whatsapp" | "email";

@Injectable()
export class TwilioVerifyService {
  private readonly log = new Logger(TwilioVerifyService.name);
  private readonly accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  private readonly authToken = process.env.TWILIO_AUTH_TOKEN || "";
  private readonly serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || "";
  private readonly defaultChannel: VerifyChannel = (process.env.TWILIO_VERIFY_CHANNEL as VerifyChannel) || "sms";

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken && this.serviceSid);
  }

  private auth(): string {
    return "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
  }

  private base(): string {
    return `https://verify.twilio.com/v2/Services/${this.serviceSid}`;
  }

  normalizePhone(to: string): string { return this.normalizeTo(to, "sms"); }

  private normalizeTo(to: string, channel: VerifyChannel): string {
    if (channel === "email") return to.trim().toLowerCase();
    const cleaned = to.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
    if (cleaned.startsWith("05") && cleaned.length === 10) return "+966" + cleaned.slice(1);
    if (cleaned.startsWith("9665")) return "+" + cleaned;
    if (cleaned.startsWith("5") && cleaned.length === 9) return "+966" + cleaned;
    return "+" + cleaned;
  }

  async start(to: string, channel?: VerifyChannel): Promise<{ sid: string; to: string; status: string }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Twilio Verify is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.");
    }
    const ch = channel || this.defaultChannel;
    const normalizedTo = this.normalizeTo(to, ch);
    const body = new URLSearchParams({ To: normalizedTo, Channel: ch });
    const res = await fetch(`${this.base()}/Verifications`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      this.log.error(`Twilio start failed: ${res.status} ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message || "تعذّر إرسال رمز التحقق");
    }
    return { sid: json.sid, to: normalizedTo, status: json.status };
  }

  async check(to: string, code: string, channel?: VerifyChannel): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Twilio Verify is not configured.");
    }
    const ch = channel || this.defaultChannel;
    const normalizedTo = this.normalizeTo(to, ch);
    const body = new URLSearchParams({ To: normalizedTo, Code: code });
    const res = await fetch(`${this.base()}/VerificationCheck`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      this.log.error(`Twilio check failed: ${res.status} ${JSON.stringify(json)}`);
      throw new BadRequestException(json?.message || "تعذّر التحقق من الرمز");
    }
    return json?.status === "approved" && json?.valid === true;
  }
}
