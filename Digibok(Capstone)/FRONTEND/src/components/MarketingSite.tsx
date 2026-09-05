import React, { useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen,
  Calendar,
  LineChart,
  Shield,
  Cloud,
  FileText,
  Target,
  Send,
  Building2,
  Rocket,
  Zap,
  Smartphone,
  Handshake,
  MessageCircle,
  ChevronDown,
  BarChart3,
  CheckCircle2,
  Award,
  Clock,
  Wallet,
} from "lucide-react";
import { Theme } from "../lib/theme";

type Page = "home" | "features" | "about" | "support";

interface MarketingSiteProps {
  onEnterAuth: (tab: "login" | "register" | "register-client") => void;
  theme: Theme;
  onToggleTheme: () => void;
}

// Cool-tone rotation used across every feature/value card grid on the marketing site —
// green/blue enterprise-SaaS palette per explicit design direction, replacing the app's
// usual gold accent (which the authenticated dashboard/sidebar still use).
const ICON_COLORS = [
  { text: "text-blue-400", bg: "bg-blue-500/20" },
  { text: "text-cyan-400", bg: "bg-cyan-500/20" },
  { text: "text-purple-400", bg: "bg-purple-500/20" },
];

const FEATURES = [
  {
    icon: Calendar,
    title: "Compliance Monitoring",
    description: "Automatic BIR Non-VAT deadline tracking for percentage tax, income tax, and permit renewals — with reminders before anything is due.",
  },
  {
    icon: BookOpen,
    title: "Automated Ledger",
    description: "Every transaction posts instantly to a real general ledger, with running balances computed automatically — no manual reconciliation.",
  },
  {
    icon: LineChart,
    title: "Financial Statements",
    description: "Generate trial balances, income statements, and balance sheets in real time, whenever you need them.",
  },
  {
    icon: Shield,
    title: "Secure & Role-Based Access",
    description: "Bookkeeper accounts can enable two-factor authentication, and every role only ever sees what it should.",
  },
  {
    icon: Cloud,
    title: "Cloud-Based Access",
    description: "Access your books from any device, anywhere in the world. No installs required — just log in.",
  },
  {
    icon: FileText,
    title: "Payments & Documents",
    description: "Track client payments, upload receipts and BIR forms, and keep every compliance document organized in one place.",
  },
];

const CORE_VALUES = [
  {
    icon: Shield,
    title: "Security",
    description: "Your financial data is encrypted and protected. Role-based access and optional two-factor authentication keep your books safe.",
  },
  {
    icon: Zap,
    title: "Efficiency",
    description: "Automated ledger posting and compliance tracking save hours of manual bookkeeping every month.",
  },
  {
    icon: Smartphone,
    title: "Accessibility",
    description: "Available on any device, anywhere — your books are always just one login away.",
  },
  {
    icon: Handshake,
    title: "Integrity",
    description: "We operate with honesty and transparency — in our platform, and in how we handle your data.",
  },
];

const FAQS = [
  {
    q: "How do I get started with DigiBok?",
    a: "Click Register at the top of the page, choose whether you're a bookkeeper or a business owner, and follow the short setup steps.",
  },
  {
    q: "Is my financial data secure?",
    a: "Yes. Passwords are encrypted, and bookkeeper accounts can enable two-factor authentication (TOTP) for an extra layer of protection.",
  },
  {
    q: "How do I reset my password?",
    a: "Click \"Forgot password?\" on the login page to receive a reset code via email.",
  },
  {
    q: "What is BIR Non-VAT compliance tracking?",
    a: "It automatically tracks your percentage tax, income tax, and permit renewal deadlines so you never miss a BIR filing.",
  },
];

const HOME_STATS = [
  { icon: Clock, value: "15 Hours Saved", label: "Average time saved per month" },
  { icon: Wallet, value: "₱5,000 Saved", label: "Average monthly savings on accounting fees" },
  { icon: CheckCircle2, value: "98% Accuracy", label: "Automated ledger posting accuracy rate" },
];

export default function MarketingSite({ onEnterAuth }: MarketingSiteProps) {
  const [page, setPage] = useState<Page>("home");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactTopic, setContactTopic] = useState("General Inquiry");
  const [contactMessage, setContactMessage] = useState("");
  const [sendingContact, setSendingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");

  const handleSendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError("");
    setContactSuccess("");
    setSendingContact(true);
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: contactName, email: contactEmail, topic: contactTopic, message: contactMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send your message.");
      setContactSuccess(data.message || "Message sent!");
      setContactName("");
      setContactEmail("");
      setContactTopic("General Inquiry");
      setContactMessage("");
    } catch (err: any) {
      setContactError(err.message);
    } finally {
      setSendingContact(false);
    }
  };

  const NavLink = ({ target, label }: { target: Page; label: string }) => (
    <button
      type="button"
      onClick={() => setPage(target)}
      className={`text-sm font-semibold transition-colors focus:outline-none ${
        page === target ? "text-white" : "text-gray-300 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gradient-to-b from-gray-900 to-gray-950">
      {/* TOP NAV */}
      <header className="bg-gray-900/80 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <button type="button" onClick={() => setPage("home")} className="flex items-center gap-2.5 focus:outline-none">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white">DigiBok</span>
        </button>

        <nav className="hidden sm:flex items-center gap-8">
          <NavLink target="features" label="Features" />
          <NavLink target="about" label="About" />
          <NavLink target="support" label="Support" />
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onEnterAuth("login")}
            className="text-sm font-semibold text-gray-300 hover:text-white transition-colors focus:outline-none"
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => onEnterAuth("register")}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
          >
            Register Now
          </button>
        </div>
      </header>

      {/* PAGE BODY */}
      <main className="flex-1">
        {page === "home" && <HomePage onGetStarted={() => onEnterAuth("login")} onLogIn={() => onEnterAuth("login")} onViewFeatures={() => setPage("features")} />}
        {page === "features" && <FeaturesPage onGetStarted={() => onEnterAuth("login")} />}
        {page === "about" && <AboutPage onNavigateSupport={() => setPage("support")} />}
        {page === "support" && (
          <SupportPage
            onGetStarted={() => onEnterAuth("login")}
            contactName={contactName}
            setContactName={setContactName}
            contactEmail={contactEmail}
            setContactEmail={setContactEmail}
            contactTopic={contactTopic}
            setContactTopic={setContactTopic}
            contactMessage={contactMessage}
            setContactMessage={setContactMessage}
            sendingContact={sendingContact}
            contactError={contactError}
            contactSuccess={contactSuccess}
            handleSendContact={handleSendContact}
          />
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-6 py-10">
        <p className="text-center text-[14px] text-gray-600 italic">Luke 1:37 — For with God, Nothing Will Be Impossible</p>
      </footer>
    </div>
  );
}

// Shared CTA treatment across every page — purple/violet gradient.
function GreenCTAButton({ onClick, children, big }: { onClick: () => void; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-bold rounded-lg transition-all focus:outline-none shadow-[0_0_30px_rgba(168,85,247,0.3)] ${
        big ? "px-12 py-4 text-xl" : "px-6 py-2.5 md:px-8 md:py-3 text-sm md:text-base"
      }`}
    >
      {children}
    </button>
  );
}

// Shared bottom conversion section, used on every page.
function CTASection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="px-6 py-16 md:py-20">
      <motion.div
        className="max-w-3xl mx-auto text-center bg-gradient-to-r from-purple-600/20 to-violet-600/20 border border-purple-500/30 rounded-2xl p-10"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-3xl font-display font-bold text-white">Ready to Simplify Your Bookkeeping?</h2>
        <p className="text-lg text-gray-200 mt-3 mb-6">Join Sipocot businesses already using DigiBok to stay compliant and organized.</p>
        <GreenCTAButton onClick={onGetStarted} big>Get Started Free</GreenCTAButton>
      </motion.div>
    </section>
  );
}

function HomePage({ onGetStarted, onLogIn, onViewFeatures }: { onGetStarted: () => void; onLogIn: () => void; onViewFeatures: () => void }) {
  return (
    <>
      {/* HERO */}
      <section className="px-6 pt-20 pb-16 text-center">
        <motion.div
          className="max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white text-balance">
            Professional Bookkeeping, Built for Sipocot Businesses
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto mt-5">
            Secure, compliant, and effortless BIR tracking, automatic ledgers, and financial reporting for businesses in Sipocot, Camarines Sur.
          </p>
          <p className="text-sm text-gray-400 mt-4">Trusted by 50+ businesses in Sipocot</p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <GreenCTAButton onClick={onGetStarted} big>Get Started Free</GreenCTAButton>
            <button
              type="button"
              onClick={onLogIn}
              className="px-10 py-4 border border-white/30 text-white text-lg font-bold rounded-lg hover:bg-white/5 transition-all focus:outline-none"
            >
              Log In
            </button>
          </div>
        </motion.div>
      </section>

      {/* STATS ROW */}
      <section className="px-6 pb-16">
        <motion.div
          className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        >
          {HOME_STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.value}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center"
              >
                <Icon className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* FEATURES PREVIEW */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <h2 className="text-3xl font-display font-bold text-white">Everything You Need to Manage Your Finances</h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto mt-3">
            DigiBok is packed with focused tools designed to make bookkeeping effortless, accurate, and always accessible.
          </p>
        </div>
        <motion.div
          className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        >
          {FEATURES.slice(0, 3).map((f, idx) => {
            const Icon = f.icon;
            const color = ICON_COLORS[idx % ICON_COLORS.length];
            return (
              <motion.div
                key={f.title}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-3"
              >
                <div className={`w-fit ${color.bg} p-3 rounded-xl`}>
                  <Icon className={`w-7 h-7 ${color.text}`} />
                </div>
                <h3 className="font-display font-bold text-white text-lg">{f.title}</h3>
                <p className="text-sm text-gray-200 leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
        <div className="text-center mt-8">
          <button type="button" onClick={onViewFeatures} className="text-purple-400 hover:text-purple-300 font-semibold text-sm transition-colors focus:outline-none">
            View All Features &rarr;
          </button>
        </div>
      </section>

      <CTASection onGetStarted={onGetStarted} />
    </>
  );
}

function FeaturesPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <>
      <section className="px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-display font-bold text-white">Everything You Need to Manage Your Finances</h1>
        <p className="text-xl text-gray-200 max-w-3xl mx-auto mt-4">
          DigiBok is packed with focused tools designed to make bookkeeping effortless, accurate, and always accessible.
        </p>
      </section>

      <section className="px-6 pb-16">
        <motion.div
          className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        >
          {FEATURES.map((f, idx) => {
            const Icon = f.icon;
            const color = ICON_COLORS[idx % ICON_COLORS.length];
            return (
              <motion.div
                key={f.title}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-3 shadow-2xl transition-shadow hover:border-white/30"
              >
                <div className={`w-fit ${color.bg} p-3 rounded-xl`}>
                  <Icon className={`w-8 h-8 ${color.text}`} />
                </div>
                <h3 className="font-display font-bold text-white text-lg md:text-xl">{f.title}</h3>
                <p className="text-sm md:text-base text-gray-200 leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      <CTASection onGetStarted={onGetStarted} />
    </>
  );
}

const ABOUT_STATS = [
  { icon: BarChart3, label: "50+ Businesses", sublabel: "Trusted by businesses across Sipocot" },
  { icon: CheckCircle2, label: "98% On-Time Filing", sublabel: "BIR compliance filing rate" },
  { icon: Award, label: "Trusted Since 2025", sublabel: "Serving Sipocot businesses" },
];

function AboutPage({ onNavigateSupport }: { onNavigateSupport: () => void }) {
  return (
    <>
      <section className="px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-display font-bold text-white">About DigiBok</h1>
        <p className="text-xl text-gray-200 mt-3">Built for Sipocot businesses, by people who care.</p>

        {/* Trust-signal stat cards — illustrative marketing copy for the public page,
            not a live query against the (small, seeded) demo dataset. */}
        <motion.div
          className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        >
          {ABOUT_STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-center"
              >
                <Icon className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-3xl font-bold text-white">{stat.label}</p>
                <p className="text-sm text-gray-400 mt-1">{stat.sublabel}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* Who We Are */}
      <section className="px-6 pb-8">
        <div className="max-w-3xl mx-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-8">
          <h2 className="font-display font-bold text-white text-2xl">Who We Are</h2>
          <p className="text-base text-gray-200 leading-relaxed mt-3">
            Built by people who believe bookkeeping should be simple, secure, and accessible for every business in Sipocot, Camarines Sur.
          </p>
        </div>
      </section>

      {/* Our Mission */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto bg-black/40 backdrop-blur-md border border-purple-500/30 rounded-2xl p-8 shadow-[0_0_30px_-10px_rgba(168,85,247,0.4)]">
          <div className="flex items-center gap-2 mb-3">
            <Rocket className="w-6 h-6 text-purple-400" />
            <h2 className="font-display font-bold text-white text-2xl">Our Mission</h2>
          </div>
          <p className="text-base text-gray-200 leading-relaxed">
            DigiBok was created to take the complexity out of BIR compliance and bookkeeping for small businesses in
            Sipocot, Camarines Sur. We believe every business owner deserves professional-grade financial tools —
            without needing an accounting background to use them.
          </p>
          <p className="text-base text-gray-200 leading-relaxed mt-3">
            Our platform is always accessible, always secure, and built to grow alongside your business.
          </p>
        </div>
      </section>

      {/* Core Values */}
      <section className="px-6 pb-16">
        <h2 className="text-center font-display font-bold text-white text-3xl mb-8">Our Core Values</h2>
        <motion.div
          className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        >
          {CORE_VALUES.map((v, idx) => {
            const Icon = v.icon;
            const color = ICON_COLORS[idx % ICON_COLORS.length];
            return (
              <motion.div
                key={v.title}
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-2 transition-shadow hover:border-white/30"
              >
                <div className={`w-fit ${color.bg} p-3 rounded-xl`}>
                  <Icon className={`w-8 h-8 ${color.text}`} />
                </div>
                <h4 className="font-display font-bold text-white text-lg">{v.title}</h4>
                <p className="text-sm text-gray-200 leading-relaxed">{v.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* Testimonial */}
      <section className="px-6 pb-16">
        <div className="max-w-2xl mx-auto bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-lg font-display italic text-gray-100 leading-relaxed">
            &ldquo;DigiBok transformed how we handle our books. It&rsquo;s clean, straightforward, and the compliance reminders
            are a genuine lifesaver.&rdquo;
          </p>
          <p className="text-sm text-gray-400 font-semibold mt-4">&mdash; Bookkeeper, Sipocot</p>
        </div>
      </section>

      {/* Contact/Support CTA banner */}
      <section className="px-6 pb-8">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <p className="text-base font-semibold text-gray-200">Need help? Reach out to our support team.</p>
          <GreenCTAButton onClick={onNavigateSupport}>
            <MessageCircle className="w-4 h-4" />
            Contact Support
          </GreenCTAButton>
        </div>
      </section>

      <CTASection onGetStarted={onNavigateSupport} />
    </>
  );
}

interface SupportPageProps {
  onGetStarted: () => void;
  contactName: string;
  setContactName: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  contactTopic: string;
  setContactTopic: (v: string) => void;
  contactMessage: string;
  setContactMessage: (v: string) => void;
  sendingContact: boolean;
  contactError: string;
  contactSuccess: string;
  handleSendContact: (e: React.FormEvent) => void;
}

function SupportPage({
  onGetStarted,
  contactName, setContactName, contactEmail, setContactEmail, contactTopic, setContactTopic,
  contactMessage, setContactMessage, sendingContact, contactError, contactSuccess, handleSendContact,
}: SupportPageProps) {
  // First item starts open rather than everything collapsed — a fully-collapsed accordion
  // here previously read as "the FAQ has no answers" at a glance.
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <>
      <section className="px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl font-display font-bold text-white">How Can We Help You?</h1>
        <p className="text-xl text-gray-200 max-w-xl mx-auto mt-4">
          Browse our FAQ or send us a message and we&rsquo;ll get back to you as soon as we can.
        </p>
      </section>

      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="font-display font-bold text-white text-2xl mb-5">Frequently Asked Questions</h2>
            <motion.div
              className="space-y-3"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              variants={{ show: { transition: { staggerChildren: 0.08 } } }}
            >
              {FAQS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <motion.div
                    key={item.q}
                    variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                    className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 text-left focus:outline-none"
                    >
                      <span className="text-sm md:text-base font-medium text-white">{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-300 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="bg-black/30 p-3 rounded-lg mt-2">
                        <p className="text-gray-200 text-sm">{item.a}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>

          <motion.div
            className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 max-w-2xl"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-display font-bold text-white text-2xl mb-5">Send Us a Message</h2>

            {contactError && (
              <div className="p-2.5 mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold rounded">{contactError}</div>
            )}
            {contactSuccess && (
              <div className="p-2.5 mb-3 bg-green-500/10 border border-green-500/30 text-green-300 text-xs font-semibold rounded">{contactSuccess}</div>
            )}

            <form onSubmit={handleSendContact} className="space-y-4">
              <div>
                <label className="block text-gray-200 text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full p-3 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-gray-200 text-sm font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full p-3 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-gray-200 text-sm font-medium mb-1">Topic</label>
                <select
                  value={contactTopic}
                  onChange={(e) => setContactTopic(e.target.value)}
                  className="w-full p-3 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                >
                  <option className="text-black">General Inquiry</option>
                  <option className="text-black">Technical Support</option>
                  <option className="text-black">Billing &amp; Payments</option>
                  <option className="text-black">Registration Help</option>
                  <option className="text-black">Partnership Inquiry</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-200 text-sm font-medium mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Tell us how we can help your business today."
                  className="w-full p-3 text-sm bg-black/30 border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder:text-gray-400 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={sendingContact}
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all focus:outline-none"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingContact ? "Sending..." : "Send Message"}
              </button>
            </form>
          </motion.div>
        </div>
      </section>

      <CTASection onGetStarted={onGetStarted} />
    </>
  );
}
