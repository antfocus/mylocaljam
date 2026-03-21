export const metadata = {
  title: 'Privacy Policy — MyLocalJam',
  description: 'How MyLocalJam collects, uses, and protects your data.',
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p style={{ fontSize: '13px', color: '#7878A0', marginBottom: '32px' }}>
          Last updated: March 21, 2026
        </p>

        <Section title="What We Collect">
          <p>When you sign in with Google, we receive your name, email address, and profile photo. We use this solely to identify your account and personalize your experience (saved events, followed artists, notification preferences).</p>
          <p>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
        </Section>

        <Section title="How We Use Your Data">
          <p>Your data is used to power core app features: saving events, following artists and venues, receiving show reminders, and flagging incorrect event info. We store this data in a secure Supabase database with row-level security enabled, meaning users can only access their own data.</p>
        </Section>

        <Section title="Cookies &amp; Local Storage">
          <p>MyLocalJam uses minimal browser storage (session storage) to remember your UI preferences like dark mode and active tab. We do not use tracking cookies or third-party analytics scripts.</p>
        </Section>

        <Section title="Third-Party Services">
          <p>We use Google OAuth for authentication and Supabase for our backend database. Both services have their own privacy policies. Event data is aggregated from publicly available venue websites and ticketing platforms.</p>
        </Section>

        <Section title="Data Retention &amp; Deletion">
          <p>Your account data is retained as long as your account is active. You can request deletion of your account and all associated data by emailing us at the address below. We will process deletion requests within 30 days.</p>
        </Section>

        <Section title="Children">
          <p>MyLocalJam is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy? Reach us at <a href="mailto:mylocaljam@gmail.com" style={{ color: '#E8722A' }}>mylocaljam@gmail.com</a>.</p>
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
