import { CheckCircle2, HeartHandshake, Sparkles } from 'lucide-react'
import { BackLink } from '../../components/back-link'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { whatsappLink } from '../../lib/site-data'

const options = [
  {
    title: 'Married Counseling',
    description: 'Guidance for married couples seeking to strengthen their relationship.',
    features: ['60-minute session', 'Certified counselor', 'Personalized action plan'],
  },
  {
    title: 'Single Counseling',
    description: 'Support for singles preparing for healthy relationships and personal growth.',
    features: ['60-minute session', 'Certified counselor', 'Personalized action plan'],
  },
]

export default function CounselingPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="page-main">
        <section className="page-hero compact-hero">
          <BackLink fallbackHref="/" />
          <div className="eyebrow">COUNSELING</div>
          <h1>Choose the counseling option that applies to you.</h1>
        </section>

        <section className="service-grid two-up">
          {options.map((option) => (
            <article key={option.title} className="service-card">
              <div className="service-icon accent">
                <HeartHandshake size={22} />
              </div>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <ul className="check-list">
                {option.features.map((feature) => (
                  <li key={feature}><CheckCircle2 size={16} /> {feature}</li>
                ))}
              </ul>
              <a href={whatsappLink(`Hello, I would like to book ${option.title}.`)} target="_blank" rel="noreferrer" className="secondary-button">
                <Sparkles size={16} /> Book on WhatsApp
              </a>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
