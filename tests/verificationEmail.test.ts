import { describe, expect, test } from "bun:test";
import nodemailer from "nodemailer";
import { createVerificationEmail } from "../backend/verificationEmail";

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function visibleBody(html: string) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? "";
  return normalizeWhitespace(body.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "));
}

describe("stationery verification email", () => {
  test("provides reviewable Chinese copy and the same content without HTML", () => {
    const email = createVerificationEmail("123456", 5);
    expect(email.subject).toBe("EngNote · 你的注册验证码");
    expect(email.text).toBe(`EngNote
让读英文简单一点

开始你的收藏。
欢迎来到 EngNote。在注册窗口输入下方验证码，开启新的英文之旅。

邮箱注册验证码
123456
5 分钟内有效

仅用于本次邮箱注册，请勿向任何人透露。
如果这不是你的操作，忽略这封邮件即可。

慢慢读，一页一页来。
EngNote`);
    expect(visibleBody(email.html)).toBe(normalizeWhitespace(email.text));
    expect(email.html).toContain('<html lang="zh-CN">');
  });

  test("keeps all six digits together for selection, including leading zeroes", () => {
    const email = createVerificationEmail("001234", 5);
    expect(email.text).toContain("\n001234\n");
    expect(email.html).toMatch(/<strong\b[^>]*dir="ltr"[^>]*>001234<\/strong>/);
    expect(email.html.match(/001234/g)).toHaveLength(1);
    expect(email.subject).not.toContain("001234");
  });

  test("uses the supplied validity in both formats instead of hardcoding five minutes", () => {
    for (const minutes of [1, 5, 10]) {
      const email = createVerificationEmail("234567", minutes);
      expect(email.text).toContain(`${minutes} 分钟内有效`);
      expect(email.html).toContain(`${minutes} 分钟内有效`);
      expect(visibleBody(email.html)).toBe(normalizeWhitespace(email.text));
    }
  });

  test("rejects malformed or injectable codes and invalid validity values", () => {
    for (const code of ["", "12345", "1234567", "123 456", "12345a", "１２３４５６", "<img src=x>", "123456\n"]) {
      expect(() => createVerificationEmail(code, 5)).toThrow("exactly 6 digits");
    }
    for (const minutes of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createVerificationEmail("123456", minutes)).toThrow("positive whole number");
    }
  });

  test("is self-contained with a fluid table layout and inline visual fallbacks", () => {
    const { html } = createVerificationEmail("234567", 5);
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1.0"');
    expect(html).toContain("max-width: 520px");
    expect(html).toContain("@media only screen and (max-width: 480px)");
    expect(html).toContain('bgcolor="#f5f4e9"');
    expect(html).toContain('bgcolor="#fcfcf7"');
    expect(html).toContain("background-color: #c3d6c7");
    expect(html.match(/<table\b/g)?.length).toBe(html.match(/<table role="presentation"/g)?.length);
    expect(html).not.toMatch(/<(?:script|link|img|iframe|form)\b|\b(?:src|href)\s*=|url\(/i);
  });

  test("produces UTF-8 multipart email without contacting SMTP", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    try {
      const result = await transport.sendMail({
        from: "EngNote <sender@example.com>",
        to: "reader@example.com",
        ...createVerificationEmail("234567", 5),
      });
      const mime = result.message.toString();
      expect(mime).toMatch(/Content-Type: multipart\/alternative;/i);
      expect(mime).toMatch(/Content-Type: text\/plain; charset=utf-8/i);
      expect(mime).toMatch(/Content-Type: text\/html; charset=utf-8/i);
      expect(result.envelope.to).toEqual(["reader@example.com"]);
    } finally { transport.close(); }
  });
});
