import SwiftUI

struct RecommendationView: View {
  @EnvironmentObject var api: API
  @State private var amount = "10000"
  @State private var rate = "1"
  @State private var value = "1"
  @State private var results: [Result] = []
  @State private var error: String?
  struct Result: Decodable, Identifiable {
    let cardId: String
    let expectedMinor: Int
    var id: String { cardId }
  }
  struct Response: Decodable { let cards: [Result] }
  var body: some View {
    Form {
      Section("Your assumptions") {
        TextField("Purchase amount in cents", text: $amount).keyboardType(.numberPad)
        TextField("Points per dollar", text: $rate).keyboardType(.numberPad)
        TextField("Value in cents per point", text: $value).keyboardType(.numberPad)
        Notice(
          text:
            "Flat-rate comparison only. Verify categories, caps, portals and enrollment with your issuer. Values are assumptions, not guaranteed cash."
        )
        Button("Compare my cards") {
          Task {
            do {
              guard let a = Int(amount), let r = Int(rate), let v = Int(value) else {
                throw URLError(.badURL)
              }
              let response: Response = try await api.request(
                "/api/recommendations?amountMinor=\(a)&pointsPerDollar=\(r)&pointValueMinor=\(v)")
              results = response.cards
              error = nil
            } catch { self.error = "Enter valid assumptions or check your connection." }
          }
        }
      }
      if let error { Text(error).foregroundStyle(.red) }
      Section("Estimated incremental rewards") {
        ForEach(results) { result in
          LabeledContent(result.cardId, value: money(result.expectedMinor))
        }
      }
    }.navigationTitle("Compare cards")
  }
}
