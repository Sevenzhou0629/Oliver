import Foundation

struct Card: Codable, Identifiable {
  let id, productId, displayName, owner, relationship: String
  let primaryId: String?
}
struct CardsResponse: Codable { let cards: [Card] }
struct Offer: Codable, Identifiable {
  let id, merchant, title, expiresAt, sourceUrl, verificationStatus, personalEligibility: String
  let usage, availability, freshness: String?
  let targeted, enrollmentRequired: Bool
}
struct OffersResponse: Codable { let offers: [Offer] }
struct Transaction: Codable, Identifiable {
  let id, member, merchant, currency, date, category: String
  let amountMinor: Int
  let pending: Bool
}
struct TransactionsResponse: Codable { let transactions: [Transaction] }
struct Dashboard: Codable {
  let month, mode: String
  let totalMinor, confirmedMinor, cardCount, possiblyUsed: Int
}
struct Benefit: Codable, Identifiable {
  let id, title, ownerCardId, verificationStatus, startsAt, endsAt: String
  let allowanceMinor: Int
  let enrollmentRequired: Bool
}
struct BenefitsResponse: Codable { let benefits: [Benefit] }
struct Source: Codable, Identifiable {
  let id, url, kind: String
  let allowed: Bool
  let error, lastChecked: String?
}
struct SourcesResponse: Codable { let sources: [Source] }
struct StatusResponse: Codable {
  let status: String?
  let reason: String?
}
func money(_ minor: Int) -> String { (Decimal(minor) / 100).formatted(.currency(code: "USD")) }
