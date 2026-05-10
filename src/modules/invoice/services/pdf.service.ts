import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ShellService } from "./shell.service";
import { renderInvoiceHtml, type RenderContext } from "./invoice-template";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

@Injectable()
export class PdfService {
  constructor(private readonly shell: ShellService) {}

  async findChrome(): Promise<string | null> {
    if (process.env.CHROME_PATH) {
      try {
        await fs.access(process.env.CHROME_PATH);
        return process.env.CHROME_PATH;
      } catch {
        /* fall through to search list */
      }
    }
    for (const p of CHROME_PATHS) {
      try {
        await fs.access(p);
        return p;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  /**
   * Render the invoice HTML and return both the HTML and the PDF bytes.
   * Throws if no headless browser is installed and `pdf` is requested.
   */
  async renderHtml(ctx: RenderContext): Promise<string> {
    return renderInvoiceHtml(ctx);
  }

  async renderPdf(ctx: RenderContext): Promise<Buffer> {
    const chrome = await this.findChrome();
    if (!chrome) {
      throw new Error(
        "No headless browser found. Install Google Chrome / Chromium / Edge to enable PDF export, or set CHROME_PATH env var.",
      );
    }
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zatca-pdf-"));
    const htmlPath = path.join(tmp, "invoice.html");
    const pdfPath = path.join(tmp, "invoice.pdf");
    try {
      const html = renderInvoiceHtml(ctx);
      await fs.writeFile(htmlPath, html, "utf8");
      await this.shell.mustRun(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ]);
      return await fs.readFile(pdfPath);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}
