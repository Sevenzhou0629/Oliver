import LinkKit
import SwiftUI

// LinkKit owns all bank authentication UI. No bank credentials pass through CardPilot.
struct PlaidConnectView: View {
  @EnvironmentObject var api: API
  @State private var session: PlaidLinkSession?
  @State private var presenting = false
  @State private var consent = false
  @State private var status: String?
  struct Token: Decodable {
    let link_token: String
    let mode: String?
  }
  struct Exchange: Decodable { let itemId: String }
  var body: some View {
    Section("Connect transactions") {
      Toggle("I consent to importing my transactions", isOn: $consent)
      Button("Connect with Plaid Sandbox") { Task { await connect() } }.disabled(!consent)
      if let status { Text(status).font(.footnote) }
    }.sheet(isPresented: $presenting) { session?.sheet() }
  }
  private func connect() async {
    do {
      let token: Token = try await api.request("/api/plaid/link-token", method: "POST")
      if token.mode == "mock" {
        status = "Demo fixtures are connected; no institution login is needed."
        return
      }
      let configuration = LinkTokenConfiguration(
        token: token.link_token,
        onSuccess: { success in
          Task { @MainActor in
            presenting = false
            do {
              let result: Exchange = try await api.request(
                "/api/plaid/exchange", method: "POST",
                body: JSONSerialization.data(withJSONObject: [
                  "public_token": success.publicToken, "consent": true,
                ]))
              status =
                "Connected \(result.itemId). Confirm product mapping in the API before card-specific matches."
            } catch { status = "Token exchange failed. Try connecting again." }
          }
        }, onExit: { _ in presenting = false }, onEvent: nil, onLoad: nil)
      session = try Plaid.createPlaidLinkSession(configuration: configuration)
      presenting = true
    } catch {
      status = "Connection unavailable. Check API authentication and Sandbox configuration."
    }
  }
}
