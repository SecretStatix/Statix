"""Account approval emails via Resend (optional).

Env (read by the API process — use ``backend/.env``; restart uvicorn after edits):
  RESEND_API_KEY — if unset or empty, send returns ``detail: missing_RESEND_API_KEY_in_server_env``.
  RESEND_FROM   — default ``Statix <onboarding@resend.dev>``
  STATIX_APP_URL — public site root for CTA links; default ``https://statix.app``
"""

from __future__ import annotations

import html
import logging
import os
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ApprovalEmailSendResult:
    sent: bool
    """Human-readable reason for debugging (safe to return in JSON)."""
    detail: str


def build_approval_email_html(*, recipient_email: str, display_name: str, app_url: str) -> str:
    """Single-file HTML for email clients (tables + inline styles)."""
    safe_name = html.escape(display_name)
    safe_url = html.escape(app_url.rstrip("/") + "/market")
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Segoe UI,system-ui,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:linear-gradient(165deg,#12121a 0%,#0e0e14 100%);border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr><td style="padding:36px 32px 28px;text-align:center;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#6b7cff;">Statix</p>
          <h1 style="margin:0;font-size:26px;font-weight:600;letter-spacing:-0.02em;color:#f4f4f8;line-height:1.25;">
            You&apos;re in, {safe_name}
          </h1>
          <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#a1a1b0;">
            Your account has been <strong style="color:#8bff9a;">approved</strong>. You can trade NBA player shares,
            track your portfolio, and join weekly dividends on Base.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="{safe_url}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:linear-gradient(135deg,#5b7cff 0%,#4a6cf5 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 8px 28px rgba(91,124,255,0.35);">
            Open the market
          </a>
          <p style="margin:22px 0 0;font-size:12px;color:#6b6b7a;line-height:1.5;">
            Signed up as <span style="color:#c8c8d4;">{html.escape(recipient_email)}</span><br/>
            If you didn&apos;t request access, you can ignore this message.
          </p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:11px;color:#4a4a55;">Statix · Athlete stock market on Base</p>
    </td></tr>
  </table>
</body>
</html>"""


def _truncate(s: str, max_len: int = 240) -> str:
    s = s.replace("\n", " ").strip()
    return s if len(s) <= max_len else s[: max_len - 3] + "..."


async def send_account_approval_email(*, to_email: str, display_name: str) -> ApprovalEmailSendResult:
    """Send the post-approval welcome via Resend."""
    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    if not api_key:
        logger.info("approval email skipped — set RESEND_API_KEY to enable")
        return ApprovalEmailSendResult(False, "missing_RESEND_API_KEY_in_server_env")

    from_addr = os.getenv("RESEND_FROM", "Statix <hello@playstatix.ca>")

    subject = "You're approved — welcome to Statix"
    body_html = build_approval_email_html(
        recipient_email=to_email,
        display_name=display_name,
        app_url="https://www.playstatix.ca",
    )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_addr,
                    "to": [to_email],
                    "subject": subject,
                    "html": body_html,
                },
            )
        if r.status_code >= 400:
            logger.error("Resend error %s: %s", r.status_code, r.text[:500])
            return ApprovalEmailSendResult(
                False,
                f"resend_http_{r.status_code}: {_truncate(r.text)}",
            )
        return ApprovalEmailSendResult(True, "sent")
    except Exception as e:
        logger.exception("Failed to send approval email: %s", e)
        return ApprovalEmailSendResult(False, f"exception: {_truncate(str(e))}")
