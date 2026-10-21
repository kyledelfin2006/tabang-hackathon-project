let customEmailAdapter = null;

export function setEmailAdapter(adapter) {
  customEmailAdapter = adapter;
}

export function getEmailAdapter() {
  return customEmailAdapter;
}

export async function sendPasswordReset({
  to,
  link,
  env = process.env,
  fetchFn = fetch,
  log = console.log,
} = {}) {
  const adapter = env.emailAdapter || customEmailAdapter;
  if (adapter) {
    return adapter({ to, link });
  }

  const apiKey = env.EMAIL_API_KEY;
  const from = env.EMAIL_FROM || "Tabang <noreply@tabang.ph>";

  if (apiKey) {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Reset your Tabang password",
        text: `You requested a password reset for Tabang. Open this link within 30 minutes to set a new password:\n\n${link}\n\nIf you did not make this request, you can ignore this email.`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Email delivery failed: ${response.status} ${errorText}`);
    }

    return;
  }

  if (env.NODE_ENV !== "production") {
    log(`[Password Reset] To: ${to} Link: ${link}`);
  }
}
