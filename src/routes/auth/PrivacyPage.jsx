import { Link } from "react-router-dom";

const SECTIONS = [
  {
    heading: "1. Information we collect",
    items: [
      "Name, email, and account credentials",
      "Optional profile information such as barangay and contact number",
      "Location data when reporting emergencies",
      "Usage data for system improvement",
      "User-submitted reports and messages",
    ],
  },
  {
    heading: "2. How we use your data",
    items: [
      "To operate and maintain the platform",
      "To connect residents and responders",
      "To display emergency reports",
      "To improve performance and reliability",
    ],
  },
  {
    heading: "3. Data sharing",
    intro: "We do not sell your data. We only share it:",
    items: [
      "With responders for emergency coordination",
      "With service providers such as hosting and analytics",
      "When required by law or public safety needs",
    ],
  },
  {
    heading: "4. Data security",
    items: [
      "We implement reasonable safeguards, but no system is completely secure.",
      "Precise locations and contact numbers are kept in protected fields and are not shown in public feeds.",
      "You are responsible for protecting your credentials.",
    ],
  },
  {
    heading: "5. Your rights",
    items: [
      "Access your personal data",
      "Request correction or deletion",
      "Withdraw permissions such as location access",
    ],
  },
  {
    heading: "6. Data retention",
    items: [
      "Data is retained while your account is active. You may request deletion at any time.",
    ],
  },
  {
    heading: "7. Children's privacy",
    items: ["This platform is not intended for users under 13 years of age."],
  },
  {
    heading: "8. Policy updates",
    items: [
      "We may update this policy. Continued use of the platform means acceptance of any changes.",
    ],
  },
  {
    heading: "9. Terms of service",
    items: [
      "Use the platform only for legitimate emergency and community purposes.",
      "False reports or misuse are strictly prohibited.",
      "Provide accurate information and respect other users.",
      "The platform does not guarantee response times or outcomes. Always contact official emergency services for critical situations.",
      "Accounts may be suspended or terminated for violations of these terms.",
      'The platform is provided "as is" without warranties.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="surface-card surface-card--wide">
      <span className="section-tag">Legal</span>
      <h2>Privacy policy and terms</h2>
      <p>Last updated: April 2026</p>
      <p>
        Tabang is committed to protecting your privacy while providing a
        reliable disaster response platform.
      </p>

      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <h3>{section.heading}</h3>
          {section.intro ? <p>{section.intro}</p> : null}
          <ul className="checklist">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Contact us</h3>
      <p>
        Email: <a href="mailto:tabangdreamteam@gmail.com">tabangdreamteam@gmail.com</a>
        <br />
        Location: Aklan, Philippines
      </p>

      <div className="button-row">
        <Link className="action-button" to="/">
          Back to home
        </Link>
      </div>
    </section>
  );
}
