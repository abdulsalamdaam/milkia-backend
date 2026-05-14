import { Injectable, Logger } from "@nestjs/common";
import { LOGO_DATA_URI } from "./email-assets";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Optional override of the configured "from" address. */
  from?: string;
}

export interface MaintenanceEmailPayload {
  id: number;
  unitLabel: string | null;
  description: string;
  priority: string | null;
  status: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  propertyName?: string | null;
}

export interface ContactEmailPayload {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  description: string;
  source: string | null;
}

/**
 * Resend wrapper. We hit the REST API directly (same pattern as the Twilio
 * service) to avoid pulling in another SDK. Failures are logged but never
 * thrown to the caller — email is best-effort and must not block user flows
 * like registration or contact-form submissions.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY || "";
  private readonly from = process.env.RESEND_FROM || "Milkia <noreply@oqudk.com>";
  private readonly adminEmail = process.env.ADMIN_NOTIFY_EMAIL || "";

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Low-level send. Returns true on 2xx, false otherwise. Never throws. */
  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.isConfigured()) {
      this.log.warn("Resend not configured (RESEND_API_KEY missing); skipping email");
      return false;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: input.from || this.from,
          to: Array.isArray(input.to) ? input.to : [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          reply_to: input.replyTo,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.log.error(`Resend send failed: ${res.status} ${body}`);
        return false;
      }
      return true;
    } catch (err: any) {
      this.log.error(`Resend send threw: ${err?.message || err}`);
      return false;
    }
  }

  /* ── Templates ─────────────────────────────────────────────── */

  /**
   * One-time login code. Sent in both languages so the user sees both
   * variants regardless of which app locale they're on.
   */
  async sendLoginOtp(to: string, code: string, ttlMinutes: number): Promise<boolean> {
    if (!to) return false;
    const safeCode = escapeHtml(code);
    const html = layout(`
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:22px;">رمز الدخول · Login code</h1>
      <p style="margin:0 0 12px;color:#334155;line-height:1.7;">
        استخدم الرمز التالي لإكمال تسجيل الدخول. صالح لمدة ${ttlMinutes} دقيقة.<br/>
        Use the code below to finish signing in. Valid for ${ttlMinutes} minutes.
      </p>
      <div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;font-family:'SFMono-Regular',Menlo,monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#0f172a;padding:14px 28px;background:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;">
          ${safeCode}
        </div>
      </div>
      <p style="margin:0 0 6px;color:#64748b;font-size:13px;">
        إذا لم تطلب هذا الرمز يمكنك تجاهل هذه الرسالة.<br/>
        If you didn't request this code, ignore this email.
      </p>
    `);
    return this.send({
      to,
      subject: `رمز الدخول · Milkia login code: ${code}`,
      html,
      text: `Your Milkia login code: ${code}\nValid for ${ttlMinutes} minutes.`,
    });
  }

  async sendWelcome(to: string, name: string): Promise<boolean> {
    if (!to) return false;
    const safeName = escapeHtml(name || "");
    const html = layout(`
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:22px;">مرحباً ${safeName} 👋</h1>
      <p style="margin:0 0 12px;color:#334155;line-height:1.7;">
        شكراً لتسجيلك في <strong>Milkia</strong>. تم استلام طلبك بنجاح، وسيقوم فريقنا بمراجعة الحساب وتفعيله خلال وقت قصير.
      </p>
      <p style="margin:0 0 12px;color:#334155;line-height:1.7;">
        سنرسل لك بريداً آخر فور تفعيل الحساب لتتمكّن من الدخول وإدارة عقاراتك.
      </p>
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;">
        إذا لم تقم أنت بالتسجيل، يمكنك تجاهل هذه الرسالة.
      </p>
    `);
    return this.send({
      to,
      subject: "أهلاً بك في Milkia",
      html,
      text: `مرحباً ${name}، شكراً لتسجيلك في Milkia. سيقوم فريقنا بمراجعة حسابك وتفعيله قريباً.`,
    });
  }

  /**
   * Acknowledgment email back to the tenant (or whoever raised the request).
   * Separate from sendMaintenanceCreated which targets the admin/landlord.
   * No-op when `to` is empty — tenants without an email on file simply don't
   * get notified (we do not throw).
   */
  async sendMaintenanceAcknowledgment(to: string, payload: MaintenanceEmailPayload): Promise<boolean> {
    if (!to) return false;
    const html = layout(`
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:22px;">تم استلام طلب الصيانة ✅</h1>
      <p style="margin:0 0 12px;color:#334155;line-height:1.7;">
        شكراً لتواصلك معنا. تم تسجيل طلب الصيانة الخاص بك (رقم <strong>#${payload.id}</strong>) وسيتم التواصل معك في أقرب وقت ممكن.
      </p>
      ${row("الوحدة", payload.unitLabel || "—")}
      ${row("الأولوية", payload.priority || "medium")}
      ${row("الحالة الحالية", payload.status || "open")}
      <div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="color:#64748b;font-size:12px;margin-bottom:6px;">تفاصيل طلبك</div>
        <div style="color:#0f172a;line-height:1.7;white-space:pre-wrap;">${escapeHtml(payload.description)}</div>
      </div>
      <p style="margin:24px 0 0;color:#64748b;font-size:13px;">
        هذه رسالة تأكيد تلقائية — لا حاجة للرد عليها.
      </p>
    `);
    return this.send({
      to,
      subject: `تأكيد استلام طلب الصيانة #${payload.id}`,
      html,
      text: `تم استلام طلب الصيانة رقم #${payload.id}. سيتم التواصل معك قريباً.`,
    });
  }

  async sendMaintenanceCreated(payload: MaintenanceEmailPayload, to?: string): Promise<boolean> {
    const recipient = to || this.adminEmail;
    if (!recipient) {
      this.log.warn("sendMaintenanceCreated: no recipient (set ADMIN_NOTIFY_EMAIL)");
      return false;
    }
    const html = layout(`
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:20px;">طلب صيانة جديد #${payload.id}</h1>
      ${row("الوحدة", payload.unitLabel || "—")}
      ${row("العقار", payload.propertyName || "—")}
      ${row("المستأجر", payload.tenantName || "—")}
      ${row("رقم المستأجر", payload.tenantPhone || "—")}
      ${row("الأولوية", payload.priority || "medium")}
      ${row("الحالة", payload.status || "open")}
      <div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="color:#64748b;font-size:12px;margin-bottom:6px;">الوصف</div>
        <div style="color:#0f172a;line-height:1.7;white-space:pre-wrap;">${escapeHtml(payload.description)}</div>
      </div>
    `);
    return this.send({
      to: recipient,
      subject: `طلب صيانة جديد #${payload.id} — ${payload.unitLabel || "وحدة"}`,
      html,
    });
  }

  async sendContactReceived(payload: ContactEmailPayload, to?: string): Promise<boolean> {
    const recipient = to || this.adminEmail;
    if (!recipient) {
      this.log.warn("sendContactReceived: no recipient (set ADMIN_NOTIFY_EMAIL)");
      return false;
    }
    const html = layout(`
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:20px;">رسالة جديدة من نموذج التواصل #${payload.id}</h1>
      ${row("الاسم", payload.name || "—")}
      ${row("البريد", payload.email || "—")}
      ${row("الجوال", payload.phone || "—")}
      ${row("المصدر", payload.source || "—")}
      <div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <div style="color:#64748b;font-size:12px;margin-bottom:6px;">الرسالة</div>
        <div style="color:#0f172a;line-height:1.7;white-space:pre-wrap;">${escapeHtml(payload.description)}</div>
      </div>
    `);
    return this.send({
      to: recipient,
      subject: `رسالة تواصل جديدة #${payload.id}${payload.name ? ` — ${payload.name}` : ""}`,
      html,
      replyTo: payload.email || undefined,
    });
  }
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;">
    <span style="color:#64748b;font-size:13px;">${escapeHtml(label)}</span>
    <span style="color:#0f172a;font-weight:500;">${escapeHtml(value)}</span>
  </div>`;
}

function layout(inner: string): string {
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Milkia</title>
</head>
<body style="margin:0;padding:32px 16px;background:#eef2f7;font-family:-apple-system,'Segoe UI',Tahoma,Arial,'Tajawal',sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
    <!-- Logo header — soft brand-blue gradient banner -->
    <tr>
      <td style="background:linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%);border-radius:16px 16px 0 0;padding:28px 24px;text-align:center;border:1px solid #e2e8f0;border-bottom:0;">
        <img src="${LOGO_DATA_URI}" alt="Milkia · ملكية" width="160" height="80" style="display:inline-block;height:auto;max-width:160px;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>
    <!-- Main content card -->
    <tr>
      <td style="background:#ffffff;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:0;padding:32px;line-height:1.65;">
        ${inner}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:20px 8px 0;text-align:center;color:#94a3b8;font-size:12px;">
        <div style="margin-bottom:6px;">© ${new Date().getFullYear()} Milkia · ملكية — منصة إدارة العقارات</div>
        <div><a href="https://oqudk.com" style="color:#94a3b8;text-decoration:none;">oqudk.com</a></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
