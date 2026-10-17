import { Link } from "react-router-dom";

// Draft for Len's review (plan phase 5). It describes what this build does;
// it is not legal advice and has not been reviewed by a lawyer or a Data
// Protection Officer.
const SECTIONS = [
  {
    heading: "1. Information we collect",
    items: [
      "Your name, email address, mobile number, and barangay, which you give when you create an account.",
      "What you put in a report: the municipality and barangay, an optional landmark, a description, a contact number, and optional photos.",
      "Your phone's location, only if you choose \"Use my current location\" on a report.",
      "If you apply to be a responder: your organization, badge number, a photo of a government ID, and a selfie.",
    ],
  },
  {
    heading: "2. How we use it",
    items: [
      "To let responders see and act on your reports, and to contact you about them.",
      "To show you the status of your own reports.",
      "To check responder applications. Your ID and selfie are seen only by you and a reviewer.",
      "To publish public advisories. An advisory never includes your name, contact number, description, or exact location.",
    ],
  },
  {
    heading: "3. Who can see it",
    items: [
      "Responders handling reports can see a report's description, contact number, photos, and exact location.",
      "The barangay and municipality of a report may appear in public summaries; the landmark and everything else stay private.",
      "Partner agencies connected to Tabang receive incident type, status, municipality, barangay, and times only. They never receive contact numbers, descriptions, exact locations, or who filed a report.",
      "We do not sell your data.",
      "We may disclose information when the law requires it.",
    ],
  },
  {
    heading: "4. Where it is stored",
    items: [
      "Accounts, reports, and files are stored with Supabase, which processes them on our behalf. Photos and identity documents are kept in private storage and opened only through links that expire within minutes.",
      "A report that could not be sent is saved on your phone until it is sent or you discard it. Signing out removes it from the phone.",
    ],
  },
  {
    heading: "5. How long we keep it",
    items: [
      "Your ID and selfie are deleted once a reviewer records a decision on your application. If deletion fails, it is retried; the decision is kept.",
      "Reports are kept as a record of the emergency response, including after they are resolved or cancelled.",
      "Account details are kept while your account is active. Ask us to delete your account using the contact below.",
    ],
  },
  {
    heading: "6. Your rights",
    items: [
      "Under the Data Privacy Act of 2012 (Republic Act No. 10173), you may ask to access, correct, or delete your personal data, and you may object to its processing.",
      "You can correct your name, mobile number, and barangay yourself on your account page.",
      "You can turn off location access for Tabang in your phone's settings at any time; reports still work without it.",
    ],
  },
  {
    heading: "7. Children",
    items: ["Tabang is not intended for users under 13 years of age."],
  },
  {
    heading: "8. Changes to this policy",
    items: [
      "We will update this page when what we collect or how we use it changes, and show the date of the change at the top.",
    ],
  },
  {
    heading: "9. Terms of use",
    items: [
      "Use Tabang only for real emergencies and community safety.",
      "False reports and misuse are prohibited and may lead to suspension.",
      "Tabang does not guarantee a response or a response time. In a life-threatening emergency, call 911 directly.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="surface-card surface-card--wide">
      <span className="section-tag">Legal</span>
      <p>Last updated: October 2026</p>
      <p>
        Tabang is committed to protecting your privacy while providing a
        reliable disaster response platform.
      </p>

      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          {section.intro ? <p>{section.intro}</p> : null}
          <ul className="checklist">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Contact us</h2>
      <p>
        Email:{" "}
        <a href="mailto:tabangdreamteam@gmail.com">tabangdreamteam@gmail.com</a>
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
