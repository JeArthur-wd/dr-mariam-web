import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ShieldCheck, Users } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { whatsappLink } from '../../lib/site-data'

export default function ForumPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="page-main">
        <section className="page-hero compact-hero">
          <Link className="back-link" href="/">
            <ArrowLeft size={17} /> Back to Home
          </Link>
          <div className="eyebrow">SINGLES FORUM</div>
          <h1>Join our Private Forum</h1>
        </section>

        <section className="feature-panel">
          <div className="feature-icon"><Users size={22} /></div>
          <div>
            <h2>Private Forum</h2>
            <p>An intimate, moderated space for deeper personal conversations.</p>
          </div>
        </section>

        <div className="service-grid single-column-card">
          <article className="service-card forum-card">
            <ul className="check-list">
              <li><CheckCircle2 size={16} /> Small group setting</li>
              <li><ShieldCheck size={16} /> Confidential</li>
              <li><CheckCircle2 size={16} /> Expert facilitation</li>
            </ul>
            <a href={whatsappLink('Hello, I would like to join the private singles forum.')} target="_blank" rel="noreferrer" className="secondary-button">
              Request to join
            </a>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
