import { BackLink } from '../../components/back-link'
import { SiteFooter, SiteHeader } from '../../components/site-shell'
import { books, whatsappLink } from '../../lib/site-data'

export default function BooksPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="page-main">
        <section className="page-hero compact-hero">
          <BackLink fallbackHref="/" />
          <div className="eyebrow">BOOKS</div>
          <h1>Explore our available books</h1>
        </section>

        <section className="resource-grid books-grid">
          {books.map((book) => (
            <article key={book.title} className="resource-card book-card">
              <div className="book-cover">
                <img src={book.image} alt={`Cover of ${book.title}`} loading="lazy" />
              </div>
              <h2>{book.title}</h2>
              <p>{book.description}</p>
              <div className="resource-meta">
                <strong>{book.price}</strong>
                <a href={whatsappLink(`Hello, I would like to order ${book.title} (${book.price}).`)} target="_blank" rel="noreferrer" className="secondary-button small-button">Order Now</a>
              </div>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
