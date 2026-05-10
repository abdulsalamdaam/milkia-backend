import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QrService } from "./qr.service";

describe("QrService", () => {
  const qr = new QrService();

  describe("encodeTlv", () => {
    it("emits a tag-length-value sequence", () => {
      const out = qr.encodeTlv([
        [1, "ab"],
        [2, "x"],
      ]);
      const buf = Buffer.from(out, "base64");
      // tag=1, len=2, "ab", tag=2, len=1, "x"
      assert.deepEqual([...buf], [1, 2, 0x61, 0x62, 2, 1, 0x78]);
    });

    it("rejects values longer than 255 bytes", () => {
      assert.throws(() => qr.encodeTlv([[1, "a".repeat(256)]]), /too long/);
    });

    it("encodes binary values verbatim", () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      const out = qr.encodeTlv([[8, buf]]);
      const decoded = Buffer.from(out, "base64");
      assert.deepEqual([...decoded.subarray(0, 2)], [8, 4]);
      assert.deepEqual(Buffer.compare(decoded.subarray(2), buf), 0);
    });
  });

  describe("buildPhase1Qr", () => {
    it("encodes 5 string tags", () => {
      const out = qr.buildPhase1Qr({
        sellerName: "ACME",
        vatNumber: "300000000000003",
        timestamp: "2026-05-08T10:00:00",
        totalWithVat: "115.00",
        vatTotal: "15.00",
      });
      const buf = Buffer.from(out, "base64");
      // First TLV: tag=1, len=4 ("ACME")
      assert.equal(buf[0], 1);
      assert.equal(buf[1], 4);
      assert.equal(buf.subarray(2, 6).toString(), "ACME");
    });
  });

  describe("buildPhase2Qr", () => {
    it("includes 8 tags without certSignatureDer", () => {
      const out = qr.buildPhase2Qr({
        sellerName: "S",
        vatNumber: "V",
        timestamp: "T",
        totalWithVat: "1",
        vatTotal: "0",
        invoiceHashBase64: "H",
        signatureBase64: "G",
        publicKeyDer: Buffer.from([0]),
      });
      // Walk and count tags
      const buf = Buffer.from(out, "base64");
      const tags: number[] = [];
      let p = 0;
      while (p < buf.length) {
        tags.push(buf[p]);
        const len = buf[p + 1];
        p += 2 + len;
      }
      assert.deepEqual(tags, [1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("appends tag 9 when certSignatureDer is present", () => {
      const out = qr.buildPhase2Qr({
        sellerName: "S",
        vatNumber: "V",
        timestamp: "T",
        totalWithVat: "1",
        vatTotal: "0",
        invoiceHashBase64: "H",
        signatureBase64: "G",
        publicKeyDer: Buffer.from([0]),
        certSignatureDer: Buffer.from([1, 2, 3]),
      });
      const buf = Buffer.from(out, "base64");
      const tags: number[] = [];
      let p = 0;
      while (p < buf.length) {
        tags.push(buf[p]);
        const len = buf[p + 1];
        p += 2 + len;
      }
      assert.deepEqual(tags, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });
});
