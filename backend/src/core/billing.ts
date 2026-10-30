import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import nodemailer from "nodemailer";
import db from "../db/knex";
import { paymentUri, fail, atomic, decimal } from "./domain";
import { settings } from "./settings";
export async function billingView(p: any): Promise<any> {
  const active =
    p.status === "IN_PROGRESS" && new Date(p.expires_at).getTime() > Date.now();
  return {
    ...p,
    payment_uri: active ? paymentUri(p.snapshot) : null,
    qr: active
      ? await QRCode.toDataURL(paymentUri(p.snapshot), {
          width: 280,
          margin: 2,
          errorCorrectionLevel: "M",
        })
      : null,
  };
}
export async function pdf(p: any): Promise<Buffer> {
  const view = await billingView(p);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `Payment request ${p.reference}`,
        Author: "CryptoPay Manager",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.rect(48, 48, 499, 5).fill("#0b7564");
    doc.y = 68;
    doc.fillColor("#0f172a").fontSize(25).text("CryptoPay");
    doc
      .moveDown(0.3)
      .fontSize(12)
      .fillColor("#475569")
      .text("PAYMENT REQUEST · " + p.reference);
    doc.moveDown(1.5).fontSize(28);
    const amountWidth = doc.widthOfString(p.snapshot.amount + " USDT");
    if (amountWidth > 467) doc.fontSize((28 * 467) / amountWidth);
    const panelY = doc.y,
      panelHeight =
        doc.heightOfString(p.snapshot.amount + " USDT", { width: 467 }) + 32;
    doc.roundedRect(48, panelY, 499, panelHeight, 6).fill("#edf4f2");
    doc
      .fillColor("#142637")
      .text(p.snapshot.amount + " USDT", 64, panelY + 16, { width: 467 });
    doc.x = 48;
    doc.y = panelY + panelHeight + 16;
    if (p.amount_mode === "unique")
      doc
        .fontSize(10)
        .text(
          `Requested: ${p.requested_amount} USDT. Increment: ${decimal((BigInt(p.snapshot.atomic_amount) - BigInt(atomic(p.requested_amount, p.snapshot.decimals))).toString(), p.snapshot.decimals)} USDT. Send the exact payable amount.`,
        );
    doc
      .moveDown(0.3)
      .fontSize(12)
      .text(p.snapshot.asset_label + " / " + p.snapshot.chain.toUpperCase());
    doc
      .moveDown()
      .text("Status: " + p.status)
      .moveDown()
      .text(p.description);
    doc
      .moveDown()
      .fontSize(10)
      .text("Receiving address")
      .font("Courier")
      .text(p.snapshot.address, { width: 490 })
      .font("Helvetica");
    doc.moveDown().text("Token contract / mint: " + p.snapshot.asset_address);
    doc
      .moveDown()
      .text("Created: " + new Date(p.created_at).toISOString())
      .text("Deadline: " + new Date(p.expires_at).toISOString());
    if (p.expected_from_address)
      doc.moveDown().text("Required sender: " + p.expected_from_address);
    if (p.concluded_tx_hash)
      doc.moveDown().text("Matched transaction: " + p.concluded_tx_hash);
    if (view.qr) {
      doc
        .moveDown()
        .text(
          "Scan with a compatible wallet. Send the exact token and amount on the specified network. Native network coin is required for fees.",
        );
      if (doc.y + 180 > doc.page.height - 48) doc.addPage();
      doc.image(Buffer.from(view.qr.split(",")[1], "base64"), { width: 160 });
    } else
      doc
        .moveDown()
        .text(
          "This request is no longer payable. Do not send additional funds.",
        );
    if (p.public_url)
      doc
        .moveDown()
        .fontSize(10)
        .fillColor("#0b7564")
        .text("Live billing: " + p.public_url, { link: p.public_url });
    doc
      .moveDown()
      .fontSize(9)
      .fillColor("#475569")
      .text(
        "Generated: " +
          new Date().toISOString() +
          ". This PDF is a static status snapshot, not proof of payment.",
      );
    doc.end();
  });
}
export async function emailPayment(p: any, recipient: string): Promise<any> {
  const s = await settings(true);
  if (!s.smtp_enabled || !s.smtp_host || !s.smtp_from)
    fail(
      409,
      "SMTP_NOT_CONFIGURED",
      "Configure SMTP in Settings before sending email.",
    );
  try {
    const transport = nodemailer.createTransport({
      host: s.smtp_host,
      port: s.smtp_port,
      secure: s.smtp_security === "tls",
      requireTLS: s.smtp_security === "starttls",
      ignoreTLS: s.smtp_security === "none",
      auth: s.smtp_user
        ? { user: s.smtp_user, pass: s.smtp_password }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    const result = await transport.sendMail({
      from: s.smtp_from,
      to: recipient,
      subject: `Payment request ${p.reference}`,
      text: `Payment request: ${p.description}\nAmount: ${p.snapshot.amount} ${p.snapshot.asset_label}\nNetwork: ${p.snapshot.chain}\nDeadline: ${new Date(p.expires_at).toISOString()}\nSee the attached PDF for payment instructions.${p.public_url ? `\nLive status: ${p.public_url}` : ""}`,
      attachments: [
        {
          filename: `${p.reference}.pdf`,
          content: await pdf(p),
          contentType: "application/pdf",
        },
      ],
    });
    if (!result.accepted.length) throw new Error("Rejected");
    await db("mail_deliveries").insert({
      payment_id: p.id,
      recipient,
      status: "ACCEPTED",
    });
    return {
      status: "ACCEPTED",
      message: "SMTP accepted the message. Inbox delivery is not confirmed.",
    };
  } catch {
    await db("mail_deliveries").insert({
      payment_id: p.id,
      recipient,
      status: "FAILED",
    });
    return fail(
      502,
      "EMAIL_DELIVERY_FAILED",
      "SMTP did not accept the message. Check configuration and try again.",
    );
  }
}
