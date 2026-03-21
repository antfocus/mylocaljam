export const metadata = {
  title: 'Terms of Service — MyLocalJam',
  description: 'Terms of service for using MyLocalJam.',
};

export default function TermsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0D12',
      color: '#E0E0EA',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '48px 20px 80px',
    }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <a href="/" style={{ color: '#E8722A', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}>
          &larr; Back to MyLocalJam
        </a>

        <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#F0F0F5', marginTop: '24px', marginBottom: '8px' }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: '13px', color: '#7878A0', marginBottom: '32px' }}>
          Last updated: March 21, 2026
        </p>

        <Section title="Acceptance of Terms">
          <p>By using MyLocalJam, you agree to these terms. If you don&apos;t agree, please don&apos;t use the service. We may update these terms from time to time — continued use after changes constitutes acceptance.</p>
        </Section>

        <Section title="What MyLocalJam Does">
          <p>MyLocalJam aggregates publicly available live music event listings from venues across the Jersey Shore. We aim to keep information accurate, but we&apos;re not responsible for changes made by venues (cancellations, time changes, cover charges) after we&apos;ve scraped the data. Always confirm details with the venue before heading out.</p>
        </Section>

        <Section title="User Accounts">
          <p>You can create an account using Google Sign-In to save events, follow artists, and receive notifications. You&apos;re responsible for the activity on your account. Don&apos;t share your login credentials or use the service for anything illegal or harmful.</p>
        </Section>

        <Section title="User-Submitted Content">
          <p>Users can submit events and flag incorrect information. By submitting content, you confirm it&apos;s accurate to the best of your knowledge. We reserve the right to remove submissions that are spam, misleading, or inappropriate.</p>
        </Section>

        <Section title="Intellectual Property">
          <p>Event data is sourced from publicly available venue listings. The MyLocalJam name, logo, and original design are our property. You may not copy, scrape, or redistribute our aggregated data without permission.</p>
        </Section>

        <Section title="Limitation of Liability">
          <p>MyLocalJam is provided &quot;as is&quot; without warranty. We&apos;re not liable for inaccurate event info, missed shows, or any damages arising from use of the service. Use your own judgment when making plans based on our listings.</p>
        </Section>

        <Section title="Termination">
          <p>We may suspend or terminate accounts that violate these terms or abuse the service. You can delete your account at any time by contacting us.</p>
        </Section>

        <Section title="Contact">
          <p>Questions? Reach us at <a href="mailto:mylocaljam@gmail.com" style={{ color: '#E8722A' }}>mylocaljam@gmail.com</a>.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#F0F0F5', marginBottom: '8px' }}>{title}</h2>
      <div style={{ fontSize: '15px', lineHeight: '1.7', color: '#B0B0C8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children}
      </div>
    </div>
  );
}
