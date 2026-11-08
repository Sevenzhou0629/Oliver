import SwiftUI

struct PlaidAccountsView: View {
  @EnvironmentObject var api: API
  @State private var items: [Item] = []
  @State private var accounts: [Account] = []
  @State private var cards: [Card] = []
  @State private var selectedItem = ""
  @State private var selectedAccount = ""
  @State private var selectedCard = ""
  @State private var status: String?
  struct Item: Decodable, Identifiable { let id: String }
  struct Items: Decodable { let items: [Item] }
  struct Account: Decodable, Identifiable { let id, name: String }
  struct Accounts: Decodable { let accounts: [Account] }
  struct OK: Decodable { let ok: Bool }
  func load() async {
    do {
      let response: Items = try await api.request("/api/plaid/items")
      items = response.items
      let wallet: CardsResponse = try await api.request("/api/cards")
      cards = wallet.cards
    } catch { status = "Unable to load institutions" }
  }
  var body: some View {
    Form {
      Section("Connected Items") {
        Picker("Item", selection: $selectedItem) {
          Text("Choose Item").tag("")
          ForEach(items) { Text($0.id).tag($0.id) }
        }
        Button("Load accounts") {
          Task {
            do {
              let response: Accounts = try await api.request("/api/plaid/\(selectedItem)/accounts")
              accounts = response.accounts
            } catch { status = "Unable to load accounts" }
          }
        }.disabled(selectedItem.isEmpty)
      }
      Section("Verify card product") {
        Picker("Imported account", selection: $selectedAccount) {
          Text("Choose account").tag("")
          ForEach(accounts) { Text($0.name).tag($0.id) }
        }
        Picker("Card in Wallet", selection: $selectedCard) {
          Text("Choose your card").tag("")
          ForEach(cards) { Text("\($0.displayName) • \($0.owner)").tag($0.id) }
        }
        Button("Confirm mapping") {
          Task {
            do {
              let _: OK = try await api.request(
                "/api/plaid/\(selectedItem)/mapping", method: "POST",
                body: JSONSerialization.data(withJSONObject: [
                  "accountId": selectedAccount, "cardId": selectedCard, "confirmed": true,
                ]))
              status = "Mapping confirmed. Sync to import posted transactions."
            } catch {
              status =
                "Mapping rejected. Choose your own card; shared accounts use one import owner."
            }
          }
        }.disabled(selectedAccount.isEmpty || selectedCard.isEmpty)
        Button("Sync transactions") {
          Task {
            do {
              let _: OK = try await api.request("/api/plaid/\(selectedItem)/sync", method: "POST")
              status = "Sync completed"
            } catch { status = "Sync unavailable" }
          }
        }.disabled(selectedItem.isEmpty)
        Button("Disconnect and delete imported data", role: .destructive) {
          Task {
            do {
              let _: OK = try await api.request("/api/plaid/\(selectedItem)", method: "DELETE")
              selectedItem = ""
              accounts = []
              await load()
              status = "Disconnected and removed local imports"
            } catch { status = "Disconnect unavailable" }
          }
        }.disabled(selectedItem.isEmpty)
      }
      if let status { Text(status).font(.footnote) }
    }.navigationTitle("Institutions").task { await load() }
  }
}
