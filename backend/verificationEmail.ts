/** Pure email template; no SMTP, browser assets, remote fonts or tracking pixels. */
export function createVerificationEmail(code: string, validForMinutes: number) {
  if (code.length !== 6 || !/^\d{6}$/.test(code)) throw new Error("Verification code must contain exactly 6 digits");
  if (!Number.isSafeInteger(validForMinutes) || validForMinutes < 1) {
    throw new Error("Verification code validity must be a positive whole number of minutes");
  }

  const copy = {
    subject: "EngNote · 你的注册验证码",
    eyebrow: "让读英文简单一点",
    heading: "开始你的收藏。",
    introduction: "欢迎来到 EngNote。在注册窗口输入下方验证码，开启新的英文之旅。",
    codeLabel: "邮箱注册验证码",
    validity: `${validForMinutes} 分钟内有效`,
    security: "仅用于本次邮箱注册，请勿向任何人透露。",
    unsolicited: "如果这不是你的操作，忽略这封邮件即可。",
    signoff: "慢慢读，一页一页来。",
  };

  const text = [
    "EngNote", copy.eyebrow, "",
    copy.heading, copy.introduction, "",
    copy.codeLabel, code, copy.validity, "",
    copy.security, copy.unsolicited, "",
    copy.signoff, "EngNote",
  ].join("\n");

  // Resolve the paper/ink colors from public/css/tokens.css into inline values:
  // email clients cannot load the site's CSS or reliably use custom properties.
  // The sage tape is the site's translucent tape flattened onto the sticky paper.
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${copy.subject}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .email-content { padding: 16px 20px 28px !important; }
      .email-code { font-size: 32px !important; letter-spacing: 6px !important; }
    }
    @media (forced-colors: active) {
      .email-paper, .email-code-box { border: 1px solid CanvasText !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e9eeed; color: #293e3b; font-family: 'Segoe UI', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#e9eeed" style="width: 100%; background-color: #e9eeed;">
    <tr>
      <td align="center" style="padding: 28px 12px 36px;">
        <!--[if mso]><table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 520px; margin: 0 auto;">
          <tr>
            <td style="padding: 0 8px 28px; font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; font-size: 24px; line-height: 32px; font-weight: 600;">EngNote</td>
          </tr>
          <tr>
            <td class="email-paper" bgcolor="#f5f4e9" style="background-color: #f5f4e9; border: 1px solid #cbd5d1; border-radius: 2px 2px 16px 2px; box-shadow: 0 3px 0 #d8dfdb, 0 8px 20px #293e3b08;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
                <tr>
                  <td align="center" style="padding: 0 0 8px;">
                    <div aria-hidden="true" style="width: 112px; height: 28px; margin: -14px auto 0; background-color: #c3d6c7; border-top: 1px solid #dce5d6; border-bottom: 1px solid #dce5d6; transform: rotate(-4deg); font-size: 0; line-height: 0;">&nbsp;</div>
                  </td>
                </tr>
                <tr>
                  <td class="email-content" style="padding: 20px 32px 32px;">
                    <p style="margin: 0 0 8px; color: #546964; font-size: 12px; line-height: 20px; letter-spacing: 2px;">${copy.eyebrow}</p>
                    <h1 style="margin: 0 0 16px; color: #293e3b; font-family: 'Palatino Linotype', 'Songti SC', SimSun, Georgia, serif; font-size: 28px; line-height: 1.4; font-weight: 400;">${copy.heading}</h1>
                    <p style="margin: 0 0 24px; color: #546964; font-size: 14px; line-height: 1.9;">${copy.introduction}</p>
                    <table role="presentation" class="email-code-box" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fcfcf7" style="width: 100%; background-color: #fcfcf7; border: 1px dashed #788c87;">
                      <tr>
                        <td align="center" style="padding: 20px 12px;">
                          <p style="margin: 0 0 8px; color: #546964; font-size: 12px; line-height: 20px;">${copy.codeLabel}</p>
                          <p style="margin: 0 0 8px; line-height: 1.4;"><strong class="email-code" dir="ltr" style="display: inline-block; color: #245e64; font-family: 'Courier New', Courier, monospace; font-size: 36px; line-height: 1.4; font-weight: 700; letter-spacing: 8px; white-space: nowrap;">${code}</strong></p>
                          <p style="margin: 0; color: #546964; font-size: 13px; line-height: 22px;">${copy.validity}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 8px; color: #546964; font-size: 13px; line-height: 1.8;">${copy.security}</p>
                    <p style="margin: 0; color: #546964; font-size: 13px; line-height: 1.8;">${copy.unsolicited}</p>
                    <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px dashed #cbd5d1; color: #546964; font-family: 'Segoe Print', 'Bradley Hand', 'Songti SC', Georgia, serif; font-size: 14px; line-height: 1.8;">${copy.signoff}</p>
                    <p style="margin: 4px 0 0; color: #546964; font-family: 'Palatino Linotype', Georgia, serif; font-size: 14px; line-height: 22px;">EngNote</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: copy.subject, text, html };
}
