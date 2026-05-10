import { Injectable } from "@nestjs/common";

/**
 * ZATCA QR TLV encoding.
 *
 * Phase 2 (simplified / B2C) uses 9 tags:
 *   1: Seller name (string)
 *   2: VAT registration number (string)
 *   3: Invoice timestamp ISO-8601 (string)
 *   4: Invoice total with VAT (string)
 *   5: VAT total (string)
 *   6: XML invoice hash (base64 string)
 *   7: ECDSA signature (base64 string)
 *   8: ECDSA public key (DER bytes)
 *   9: ECDSA signature of cert public key by CA (only for simplified — DER bytes)
 *
 * Phase 1 uses tags 1–5 only.
 *
 * TLV layout: 1-byte tag, 1-byte length, value bytes. Returns base64 string.
 */
export interface Phase1Fields {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  totalWithVat: string | number;
  vatTotal: string | number;
}

export interface Phase2Fields extends Phase1Fields {
  invoiceHashBase64: string;
  signatureBase64: string;
  publicKeyDer: Buffer;
  certSignatureDer?: Buffer;
}

@Injectable()
export class QrService {
  encodeTlv(fields: Array<[number, string | number | Buffer]>): string {
    const parts: Buffer[] = [];
    for (const [tag, value] of fields) {
      const valBuf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
      if (valBuf.length > 0xff) {
        throw new Error(`TLV tag ${tag} value too long (${valBuf.length} > 255)`);
      }
      parts.push(Buffer.from([tag, valBuf.length]));
      parts.push(valBuf);
    }
    return Buffer.concat(parts).toString("base64");
  }

  buildPhase1Qr(f: Phase1Fields): string {
    return this.encodeTlv([
      [1, f.sellerName],
      [2, f.vatNumber],
      [3, f.timestamp],
      [4, String(f.totalWithVat)],
      [5, String(f.vatTotal)],
    ]);
  }

  buildPhase2Qr(f: Phase2Fields): string {
    const fields: Array<[number, string | number | Buffer]> = [
      [1, f.sellerName],
      [2, f.vatNumber],
      [3, f.timestamp],
      [4, String(f.totalWithVat)],
      [5, String(f.vatTotal)],
      [6, f.invoiceHashBase64],
      [7, f.signatureBase64],
      [8, f.publicKeyDer],
    ];
    if (f.certSignatureDer) fields.push([9, f.certSignatureDer]);
    return this.encodeTlv(fields);
  }
}
