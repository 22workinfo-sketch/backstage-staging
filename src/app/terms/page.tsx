export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "sans-serif", color: "#e2e8f0", lineHeight: "1.6" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "1rem", color: "#63d4ed" }}>Terms of Service</h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Last updated: November 23, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>1. Acceptance of Terms</h2>
        <p>
          By interacting with our services via Facebook Messenger, Telegram, or our website, you agree to these Terms of Service.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>2. Proper Use</h2>
        <p>
          You agree to use this customer support platform for lawful inquiries and customer service interactions.
          Abusive, fraudulent, or harassing messages are strictly prohibited.
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", marginBottom: "0.5rem" }}>3. Contact</h2>
        <p>
          For any inquiries regarding our terms, contact: <a href="mailto:support@botdek.io" style={{ color: "#63d4ed" }}>support@botdek.io</a>
        </p>
      </section>
    </main>
  );
}
