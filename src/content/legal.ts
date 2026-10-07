export interface LegalDoc {
  title: string
  description: string
  updated: string
  sections: { heading: string; paragraphs: string[] }[]
}

/** Plain-language policies. Have them reviewed by a qualified professional before relying on them. */
export const LEGAL: Record<"terms" | "privacy" | "risk-disclosure", LegalDoc> = {
  terms: {
    title: "Membership terms",
    description: "The terms that apply to an HG Profit Options membership.",
    updated: "October 7, 2026",
    sections: [
      {
        heading: "Membership",
        paragraphs: [
          "Memberships are sold by calendar quarter: Q1 (January to March), Q2 (April to June), Q3 (July to September) and Q4 (October to December). The minimum commitment is one quarter.",
          "Accounts are created by HG Profit Options after enrollment. Your access starts on the first day of your membership period and ends at the end of its last day, Eastern Time. You can see your current period in your account at any time.",
        ],
      },
      {
        heading: "Personal use only",
        paragraphs: [
          "Your membership is for you. You may share it with your husband, wife or life partner living at the same address. Beyond that, course content, alerts, strike price targets, charts, presentations and files may not be shared, copied, published or distributed in any way.",
          "All content is the intellectual property of HG Profit Options. Content shown in the member area may carry a visible watermark with your details. Accounts used from many locations at once may be limited or suspended.",
        ],
      },
      {
        heading: "Account security",
        paragraphs: [
          "Keep your sign-in details private. A membership allows a limited number of signed-in devices at the same time; signing in on a new device may sign out an older one.",
        ],
      },
      {
        heading: "Linked brokerage accounts",
        paragraphs: [
          "Linking a brokerage account is optional. Linked accounts are read-only: HG Profit Options can never place trades for you.",
          "When you link an account, its positions, transactions and performance become visible to HG Profit Options admins for coaching. Notes you mark as private in your trading journal are never visible to admins. You can disconnect at any time and choose to delete the data that was synced.",
        ],
      },
      {
        heading: "Educational content",
        paragraphs: [
          "Everything provided through HG Profit Options, including alerts with buy and sell points, is educational and general in nature. It is not personalized investment advice. You are responsible for your own trading decisions. See the risk disclosure for details.",
        ],
      },
      {
        heading: "Ending a membership",
        paragraphs: [
          "Access ends automatically when your last membership period ends. HG Profit Options may suspend or end access for a breach of these terms. After your membership ends you can still sign in to view and export your own trading journal.",
        ],
      },
      {
        heading: "Changes and contact",
        paragraphs: [
          "These terms may be updated. The date at the top shows the latest version. For questions, book a call with HG through the website.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    description: "What information HG Profit Options collects and how it is used.",
    updated: "October 7, 2026",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "Account details: your name, email address and, if you provide them, your phone number, WhatsApp number, location and time zone.",
          "Membership details: your membership periods and status.",
          "Usage and security details: sign-in times, IP addresses and browser information, used to protect your account and to enforce the device limit.",
          "Trading journal: trades and notes you add. If you link a brokerage account, the positions, balances and transactions it shares through our read-only connection provider.",
          "Notification settings and the browser notification tokens of devices you choose to enable.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [
          "To provide the member area, send the alerts and reminders you ask for, coach members (admins can see linked portfolios and journals, but never notes marked private), keep accounts secure, and improve the service. Aggregated, anonymous statistics may be shown to members, and only when at least five members are included.",
        ],
      },
      {
        heading: "Service providers",
        paragraphs: [
          "Data is stored with Google Firebase. Brokerage connections use a read-only connection provider. Email may be sent through an email delivery provider. These providers process data only to deliver their service.",
        ],
      },
      {
        heading: "Analytics and cookies",
        paragraphs: [
          "We use a necessary cookie to keep you signed in. Website analytics, if enabled, collect anonymous usage data about public pages.",
        ],
      },
      {
        heading: "Your choices",
        paragraphs: [
          "You can update your details in Settings, turn notifications on or off, disconnect brokerage accounts, export your journal, and request deletion of your account. Deleting your account removes your personal data, except a minimal record kept for security and legal reasons.",
        ],
      },
      {
        heading: "Retention and security",
        paragraphs: [
          "Sign-in records are kept for up to 180 days. Access to member data is restricted by role and protected with encryption in transit and at rest.",
        ],
      },
    ],
  },
  "risk-disclosure": {
    title: "Risk disclosure",
    description: "Important information about the risks of trading options and stocks.",
    updated: "October 7, 2026",
    sections: [
      {
        heading: "Education, not advice",
        paragraphs: [
          "HG Profit Options provides education. Alerts, buy and sell points, strike price targets, channel levels and all other content are general information for learning purposes. They are not personalized recommendations and do not consider your financial situation, goals or risk tolerance.",
        ],
      },
      {
        heading: "Options involve substantial risk",
        paragraphs: [
          "Options trading involves substantial risk and is not suitable for every investor. You can lose the entire amount you pay for an option, and some strategies can lose more than the initial investment. Leveraged ETFs carry additional risks, including losses that compound over time. Only trade with money you can afford to lose.",
        ],
      },
      {
        heading: "Results are not typical",
        paragraphs: [
          "Testimonials, trade results, win rates and track records describe past outcomes of individual members or of published alerts. They are not typical, are not guaranteed, and do not predict future results.",
        ],
      },
      {
        heading: "Your responsibility",
        paragraphs: [
          "You make your own trading decisions and are solely responsible for them. Consider speaking with a licensed financial professional before trading.",
        ],
      },
    ],
  },
}
