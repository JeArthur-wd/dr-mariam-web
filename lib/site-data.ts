import { BookOpenText, HeartHandshake, ShoppingBag, Sparkles, Users } from 'lucide-react'

export const navItems = [
  { label: 'Home', href: '/' },
] as const

export const serviceCards = [
  {
    title: 'Counseling',
    description: 'Get professional counseling and guidance.',
    href: '/counseling',
    icon: HeartHandshake,
  },
  {
    title: 'Singles Forum',
    description: 'Connect, learn and interact through our singles forums.',
    href: '/forum',
    icon: Users,
  },
  {
    title: 'Singles Event',
    description: 'Join us for our upcoming Singles Event.',
    href: '/event',
    icon: Sparkles,
  },
  {
    title: 'Books',
    description: 'Explore our available books.',
    href: '/books',
    icon: BookOpenText,
  },
  {
    title: 'Products',
    description: 'Shop our wellness and skincare products.',
    href: '/products',
    icon: ShoppingBag,
  },
] as const

export const books = [
  { title: 'The Ladies Guide 1', description: 'To fulfilling relationships and true happiness. The essential guide for every lady navigating life and relationships.', price: 'UGX 50,000', image: '/images/book-ladies-guide-1.jpg' },
  { title: 'The Magic of Gratitude', description: 'The Ladies Guide 4. Discover the transformative power of a grateful heart.', price: 'UGX 40,000', image: '/images/book-magic-of-gratitude.jpg' },
  { title: 'The Ladies Guide Journal', description: 'A guided journal to help you reflect, grow and heal.', price: 'UGX 60,000', image: '/images/book-ladies-guide-journal.jpg' },
  { title: 'The Ladies Guide 2', description: 'To emotional happiness. Deeper insights and wisdom for the modern woman.', price: 'UGX 50,000', image: '/images/book-ladies-guide-2.jpg' },
] as const

export const products = [
  { title: 'Skin Toning Water', description: 'A gentle toning water to refresh, balance and brighten your skin.', price: 'UGX 35,000' },
  { title: 'Skin Toner', description: 'A daily toner that tightens pores and preps your skin for moisturizer.', price: 'UGX 30,000' },
  { title: 'Black Soap', description: 'Natural African black soap for deep cleansing and glowing skin.', price: 'UGX 20,000' },
  { title: 'JC (Jelly Cream)', description: 'A rich jelly cream for deep hydration and soft, smooth skin.', price: 'UGX 25,000' },
  { title: 'Wellness Journal', description: 'A beautifully designed journal to track your emotional wellness journey.', price: 'UGX 45,000' },
  { title: 'Affirmation Cards', description: '52 daily affirmation cards to uplift and inspire you.', price: 'UGX 35,000' },
] as const

export const eventDetails = {
  date: '27 November 2026',
  venue: 'Sheraton Hotel',
  time: '4:30 PM',
  dressCode: 'Black, Red, White & Pink',
  ticketOptions: [
    { label: 'Early Bird', price: 'UGX 150,000', highlight: true },
    { label: 'Late Ticket', price: 'UGX 200,000', highlight: false },
  ],
} as const

export const heroSlides = [
  { src: '/images/hero-dr-mariam.jpg', alt: 'Dr Mariam Nagujja', position: 'center 22%' },
  { src: '/images/hero-convention-speakers.jpg', alt: 'Speakers at The Ladies Guide Convention 2026', position: 'center 35%' },
  { src: '/images/hero-convention-cake.jpg', alt: 'Cake cutting at The Ladies Guide Convention 2026', position: 'center 45%' },
  { src: '/images/hero-convention-group.jpg', alt: 'Guests at The Ladies Guide Convention 2026', position: 'center 55%' },
] as const

export const contactLinks = [
  { label: '0772-831-057', href: 'https://wa.me/256772831057' },
  { label: '0756-831-057', href: 'https://wa.me/256756831057' },
] as const

export function whatsappLink(message: string) {
  return `https://wa.me/256772831057?text=${encodeURIComponent(message)}`
}
