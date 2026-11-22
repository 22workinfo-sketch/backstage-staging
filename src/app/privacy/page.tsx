export const dynamic = "force-static";

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "sans-serif", color: "#e2e8f0", lineHeight: "1.6" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem", color: "#63d4ed" }}>Privacy Policy for Botdesk Support</h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Last updated: November 23, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>1. Information We Collect</h2>
        <p>
          Botdesk facilitates customer support communication between Facebook Pages, Telegram Bots, and support agents.
          When you interact with our supported Facebook Page or Bot, we receive messages, text, photos, and public profile identifiers
          (such as your Page-Scoped ID or name) provided by Meta Platforms, Inc. or Telegram Messenger.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>2. How We Use Information</h2>
        <p>
          We use this information solely to respond to your inquiries, provide customer support, and fulfill service requests.
          We do not sell, rent, or trade your personal data with third-party advertisers.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>3. Data Retention and Security</h2>
        <p>
          Messages and communication logs are stored securely with industry-standard encryption.
          Support data is retained only as long as necessary to provide service and customer assistance.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>4. Contact Us</h2>
        <p>
          If you have any questions or wish to request data deletion, please contact our support team at:
          <br />
          Email: <a href="mailto:support@botdek.io" style={{ color: "#63d4ed" }}>support@botdek.io</a>
        </p>
      </section>
    </main>
  );
}
