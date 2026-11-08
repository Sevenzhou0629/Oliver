import SwiftUI

struct BenefitDetail: View {
  @EnvironmentObject var api: API
  let benefit: Benefit
  let month: String
  @State private var amount = "0"
  @State private var status: String?
  struct OK: Decodable { let ok: Bool }
  func confirm(_ confirmed: Bool) async {
    do {
      guard let minor = Int(amount), minor >= 0 else {
        status = "Enter a nonnegative amount in cents"
        return
      }
      let id =
        benefit.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? benefit.id
      let _: OK = try await api.request(
        "/api/benefit-periods/\(id)/confirmation?month=\(month)", method: "PATCH",
        body: JSONSerialization.data(withJSONObject: ["confirmed": confirmed, "amountMinor": minor])
      )
      status = confirmed ? "Your attestation was saved" : "Confirmation removed"
    } catch {
      status = "Couldn’t update. Only the underlying primary owner may attest this benefit."
    }
  }
  var body: some View {
    Form {
      Section {
        Text(benefit.title).font(.headline)
        LabeledContent("Period allowance", value: money(benefit.allowanceMinor))
        Text("\(benefit.startsAt.prefix(10)) to \(benefit.endsAt.prefix(10)) (end exclusive)")
        Notice(
          text:
            "This is a synthetic benefit, not verified issuer terms. A matching purchase does not establish redemption."
        )
      }
      Section("Reward evidence") {
        TextField("Credit received, in cents", text: $amount).keyboardType(.numberPad)
        Button("Attest credit received") { Task { await confirm(true) } }
        Button("Remove confirmation") { Task { await confirm(false) } }
        if let status { Text(status) }
      }
    }.navigationTitle("Benefit period")
  }
}
