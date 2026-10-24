export const USER_SESSION_KEY = 'drmariam-user-session'
export const USER_ACCOUNTS_KEY = 'drmariam-user-accounts'
export const USER_SESSION_EVENT = 'drmariam-user-session-changed'
export const ADMIN_SESSION_KEY = 'drmariam-admin-session'
export const ADMIN_ACCOUNTS_KEY = 'drmariam-admin-accounts'
export const ADMIN_SESSION_EVENT = 'drmariam-admin-session-changed'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export type UserSession = {
  fullName: string
  email: string
  token?: string
}

export type TicketOption = {
  id: number | null
  label: string
  price: string
  amount: number
  highlight: boolean
  codePrefix?: string
  sold?: number
}

export type EventDetails = {
  id?: number | null
  title: string
  date: string
  venue: string
  time: string
  dressCode: string
  capacity?: number
  ticketsRemaining?: number
  ticketOptions: TicketOption[]
}

export type MobileMoneyNetwork = 'MTN Mobile Money' | 'Airtel Money'

export type UserAccount = UserSession & {
  password: string
}

export type ReservationTicket = {
  guestName: string
  ticketCode: string
  qrPayload: string
  checkedIn: boolean
  checkedInAt: string | null
}

export type ReservationPayload = {
  id: number
  fullName: string
  email: string
  eventTitle: string
  ticketType: string
  quantity: number
  totalAmount: string
  status: 'pending' | 'paid' | 'confirmed' | 'checked_in' | 'failed'
  paymentMethod: string
  emailSent: boolean
  tickets: ReservationTicket[]
}

export type ReservationResponse = {
  message: string
  reservation: ReservationPayload
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorData = data as { error?: string; message?: string }
    throw new Error(errorData.error || errorData.message || 'Something went wrong while communicating with the backend.')
  }

  return data as T
}

export function readStoredAccounts(): UserAccount[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(USER_ACCOUNTS_KEY)
    return stored ? (JSON.parse(stored) as UserAccount[]) : []
  } catch {
    return []
  }
}

export function saveUserAccount(account: UserAccount) {
  if (typeof window === 'undefined') return

  const currentAccounts = readStoredAccounts()
  const updatedAccounts = [...currentAccounts, account]
  window.localStorage.setItem(USER_ACCOUNTS_KEY, JSON.stringify(updatedAccounts))
}

export function readSession(): UserSession | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(USER_SESSION_KEY)
    return stored ? (JSON.parse(stored) as UserSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: UserSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event(USER_SESSION_EVENT))
}

export function clearSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(USER_SESSION_KEY)
  window.dispatchEvent(new Event(USER_SESSION_EVENT))
}

export function readStoredAdminAccounts(): UserAccount[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(ADMIN_ACCOUNTS_KEY)
    return stored ? (JSON.parse(stored) as UserAccount[]) : []
  } catch {
    return []
  }
}

export function saveAdminAccount(account: UserAccount) {
  if (typeof window === 'undefined') return

  const currentAccounts = readStoredAdminAccounts()
  const updatedAccounts = [...currentAccounts, account]
  window.localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(updatedAccounts))
}

export function readAdminSession(): UserSession | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(ADMIN_SESSION_KEY)
    return stored ? (JSON.parse(stored) as UserSession) : null
  } catch {
    return null
  }
}

export function saveAdminSession(session: UserSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT))
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ADMIN_SESSION_KEY)
  window.dispatchEvent(new Event(ADMIN_SESSION_EVENT))
}

export async function registerAdmin(payload: { fullName: string; email: string; password: string }) {
  const data = await apiRequest<{ admin: UserSession }>('/api/admin/auth/signup/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.admin
}

export async function loginAdmin(payload: { email: string; password: string }) {
  const data = await apiRequest<{ admin: UserSession }>('/api/admin/auth/login/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.admin
}

export async function adminApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = readAdminSession()
  if (!session?.token) {
    throw new Error('Administrator login required.')
  }

  return apiRequest<T>(path, {
    ...options,
    headers: {
      Authorization: `Token ${session.token}`,
      ...(options.headers || {}),
    },
  })
}

export async function logoutAdmin() {
  const session = readAdminSession()
  if (session?.token) {
    try {
      await adminApiRequest('/api/admin/auth/logout/', { method: 'POST' })
    } catch {
      // Clear a local session even when the backend is unavailable.
    }
  }
  clearAdminSession()
}

export async function fetchEventDetails() {
  const data = await apiRequest<EventDetails>('/api/event/details/', {
    method: 'GET',
  })
  return data
}

export async function registerMember(payload: { fullName: string; email: string; password: string }) {
  const data = await apiRequest<{ user: UserSession; message: string }>('/api/auth/signup/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.user
}

export async function loginMember(payload: { email: string; password: string }) {
  const data = await apiRequest<{ user: UserSession; message: string }>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.user
}

export async function fetchCurrentMember() {
  const session = readSession()
  if (!session?.token) return null

  const data = await apiRequest<{ user: UserSession }>('/api/auth/me/', {
    method: 'GET',
    headers: {
      Authorization: `Token ${session.token}`,
    },
  })

  return data.user
}

export async function logoutMember() {
  const session = readSession()
  if (session?.token) {
    try {
      await apiRequest('/api/auth/logout/', {
        method: 'POST',
        headers: {
          Authorization: `Token ${session.token}`,
        },
      })
    } catch {
      // Ignore backend logout failures and clear the local session anyway.
    }
  }

  clearSession()
}

export async function reserveTicket(payload: {
  fullName: string
  email: string
  phone: string
  ticketTypeId: number
  quantity: number
  guestNames: string[]
  paymentMethod: MobileMoneyNetwork
  paymentPhone: string
}): Promise<ReservationResponse> {
  const session = readSession()
  if (!session?.token) {
    throw new Error('Member login required to reserve a ticket.')
  }

  return apiRequest<ReservationResponse>('/api/event/reserve/', {
    method: 'POST',
    headers: {
      Authorization: `Token ${session.token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function initiatePayment(payload: {
  reservationId: number
  phoneNumber: string
  paymentMethod: MobileMoneyNetwork
}) {
  const session = readSession()
  if (!session?.token) {
    throw new Error('Member login required to complete payment.')
  }

  return apiRequest<{ status: string; message: string; reference: string; gateway: string }>('/api/payments/initiate/', {
    method: 'POST',
    headers: {
      Authorization: `Token ${session.token}`,
    },
    body: JSON.stringify(payload),
  })
}

export async function fetchReservation(reservationId: number) {
  const session = readSession()
  if (!session?.token) {
    throw new Error('Member login required to view ticket status.')
  }

  return apiRequest<{ reservation: ReservationPayload }>(`/api/event/reservations/${reservationId}/`, {
    method: 'GET',
    headers: {
      Authorization: `Token ${session.token}`,
    },
  })
}


