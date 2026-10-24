import { Sparkles } from 'lucide-react'
import { BackLink } from '../../components/back-link'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { products, whatsappLink } from '../../lib/site-data'

export default function ProductsPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="page-main">
        <section className="page-hero compact-hero">
          <BackLink fallbackHref="/" />
          <div className="eyebrow">PRODUCTS</div>
          <h1>Explore our wellness and skincare products</h1>
        </section>

        <section className="resource-grid">
          {products.map((product) => (
            <article key={product.title} className="resource-card">
              <div className="resource-icon"><Sparkles size={22} /></div>
              <h2>{product.title}</h2>
              <p>{product.description}</p>
              <div className="resource-meta">
                <strong>{product.price}</strong>
                <a href={whatsappLink(`Hello, I would like to order ${product.title} (${product.price}).`)} target="_blank" rel="noreferrer" className="secondary-button small-button">Order Now</a>
              </div>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
