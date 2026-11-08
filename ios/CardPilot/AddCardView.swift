import SwiftUI

struct AddCardView: View {
  @EnvironmentObject var api: API
  @Environment(\.dismiss) private var dismiss
  @State private var productID = ""
  @State private var name = ""
  @State private var status: String?
  var body: some View {
    Form {
      TextField("Canonical product ID", text: $productID).textInputAutocapitalization(.never)
      TextField("Card product name", text: $name)
      Notice(
        text:
          "Manual primary account. Verify the exact product after Plaid Link; this does not establish benefit eligibility or any card numbers."
      )
      Button("Add primary card") {
        Task {
          do {
            let _: Card = try await api.request(
              "/api/cards", method: "POST",
              body: JSONSerialization.data(withJSONObject: [
                "productId": productID, "displayName": name, "relationship": "primary",
              ]))
            dismiss()
          } catch { status = "Unable to add card" }
        }
      }.disabled(name.isEmpty || productID.isEmpty)
      if let status { Text(status) }
    }.navigationTitle("Add card")
  }
}
