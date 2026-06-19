export type Status = 'available' | 'booked' | 'blocked' | 'unknown'

export type BookingStatus =
  | 'new'
  | 'consulting'
  | 'waiting_customer'
  | 'waiting_owner'
  | 'waiting_deposit'
  | 'deposit_received'
  | 'confirmed'
  | 'cancelled'
  | 'lost'

export type Channel = 'facebook' | 'instagram' | 'zalo' | 'website' | 'other'

export interface Property {
  id: string
  name: string
  ownerId: string
  ownerName: string
  area: string
  address: string
  bedrooms: number
  capacityStandard: number
  capacityMax: number
  amenities: string[]
  rules: string[]
  images: string[]
  basePrice: number
  extraFeeNote: string
  lastSyncedAt: string
  sourceSheetUrl: string
  description?: string // mô tả căn (từ tab "Thông tin")
  mapUrl?: string // link Google Maps
}

export interface TrendPoint {
  month: string // YYYY-MM
  booked: number
  total: number
}

export interface AvailabilityDay {
  date: string // YYYY-MM-DD
  status: Status
  price: number | null
  minNights: number
  note: string
  confidence: number
  sourceUpdatedAt: string
}

export interface ReviewItem {
  id: string
  propertyId: string
  propertyName: string
  date: string
  rawValue: string
  rawColorHex: string
  suggestedStatus: Status
  suggestedPrice: number | null
  confidence: number
}

export interface BookingRequest {
  id: string
  propertyId: string
  propertyName: string
  customerName: string
  customerContact: string
  channel: Channel
  checkin: string
  checkout: string
  guests: number
  quotedPrice: number
  status: BookingStatus
  assignee: string
  note: string
  createdAt: string
}

export interface Sheet {
  id: string
  ownerName: string
  ownerPhone: string
  url: string
  city?: string
  active?: boolean
  propertyCount: number
  syncStatus: 'ok' | 'error' | 'needs_check'
  lastSyncedAt: string
  assignee: string
  commissionRate: number
  lastError?: string
}

export interface SearchParams {
  checkin: string
  checkout: string
  guests: number
  area?: string
  maxPrice?: number
}

export interface SearchResult {
  property: Property
  avgPrice: number
  nights: number
  hasReview: boolean
}
