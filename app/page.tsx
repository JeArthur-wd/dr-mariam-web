import Link from 'next/link'
import { ArrowRight, MessageSquareText } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../components/site-shell'
import { serviceCards } from '../lib/site-data'

export default function HomePage() {
  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="page-main landing-page">
        <section className="page-hero home-hero">
          <div className="hero-pill">For women seeking clarity, connection and renewal</div>
          <h1>Choose the support that fits your season.</h1>
          <p>Care, clarity, community and tools for your wellness journey.</p>

          <div className="hero-actions">
            <Link href="/counseling" className="primary-button">
              Book counseling
            </Link>
            <Link href="/user/login" className="secondary-button secondary-light">
              Member login
            </Link>
          </div>

          <div className="hero-stats" aria-label="Site highlights">
            <div className="stat-item">
              <strong>1:1</strong>
              <span>Support</span>
            </div>
            <div className="stat-item">
              <strong>Community</strong>
              <span>Safe spaces</span>
            </div>
            <div className="stat-item">
              <strong>Wellness</strong>
              <span>Practical tools</span>
            </div>
          </div>
        </section>

        <section className="service-grid">
          {serviceCards.map(({ title, description, href, icon: Icon }) => (
            <article key={title} className="service-card home-card">
              <div className="service-icon">
                <Icon size={22} />
              </div>
              <h2>{title}</h2>
              <p>{description}</p>
              <Link href={href} className="secondary-button">
                Choose <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </section>

        <section className="feature-panel intro-panel">
          <div className="feature-icon"><MessageSquareText size={22} /></div>
          <div>
            <h2>Supportive guidance for real life</h2>
            <p>From counseling and community conversations to practical resources and wellness products, Dr Mariam Nagujja Ladies Guide is designed to help you grow with confidence.</p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
