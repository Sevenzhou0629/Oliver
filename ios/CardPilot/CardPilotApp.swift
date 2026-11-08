import SwiftUI

@main struct CardPilotApp: App {
  @StateObject private var api = API()
  var body: some Scene {
    WindowGroup {
      TabView {
        HomeView().tabItem { Label("Home", systemImage: "house") }
        DiscoverView().tabItem { Label("Discover", systemImage: "sparkle.magnifyingglass") }
        SpendingView().tabItem { Label("Spending", systemImage: "chart.bar") }
        WalletView().tabItem { Label("Wallet", systemImage: "creditcard") }
        SettingsView().tabItem { Label("Settings", systemImage: "gear") }
      }.environmentObject(api).tint(.teal)
    }
  }
}
struct Notice: View {
  let text: String
  var body: some View {
    Label(text, systemImage: "info.circle").font(.footnote).foregroundStyle(.secondary)
  }
}
struct LoadError: View {
  let error: String
  let retry: () -> Void
  var body: some View {
    ContentUnavailableView {
      Label("Couldn’t load data", systemImage: "wifi.exclamationmark")
    } description: {
      Text(error)
    } actions: {
      Button("Retry", action: retry)
    }
  }
}
struct HomeView: View {
  @EnvironmentObject var api: API
  @State private var dashboard: Dashboard?
  @State private var benefits: [Benefit] = []
  @State private var error: String?
  @State private var month = "2026-11"
  func load() async {
    do {
      dashboard = try await api.request("/api/households/\(api.household)/dashboard?month=\(month)")
      let response: BenefitsResponse = try await api.request("/api/benefits?month=\(month)")
      benefits = response.benefits
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  var body: some View {
    NavigationStack {
      Group {
        if let error {
          LoadError(error: error) { Task { await load() } }
        } else if let d = dashboard {
          List {
            Section {
              Notice(
                text: d.mode == "mock"
                  ? "Demo household • fictional offers and benefit amounts"
                  : "Household snapshot • verify issuer terms and enrollment")
              Picker("Month", selection: $month) {
                Text("November 2026").tag("2026-11")
                Text("December 2026").tag("2026-12")
              }
              LabeledContent("Posted spending", value: money(d.totalMinor))
              LabeledContent("Confirmed savings", value: money(d.confirmedMinor))
              LabeledContent("Possible matches", value: "\(d.possiblyUsed)")
              LabeledContent("Cards", value: "\(d.cardCount)")
            } header: {
              Text("Your month at a glance")
            }
            Section("Benefit periods") {
              ForEach(benefits) { b in
                NavigationLink {
                  BenefitDetail(benefit: b, month: month)
                } label: {
                  VStack(alignment: .leading, spacing: 6) {
                    Text(b.title).font(.headline)
                    Text("\(money(b.allowanceMinor)) • \(b.ownerCardId)").font(.subheadline)
                    Text("Ends \(b.endsAt.prefix(10)) • activation required").font(.caption)
                    Notice(text: "Synthetic rule demonstration, not verified issuer terms")
                  }.padding(.vertical, 4)
                }
              }
            }
          }.refreshable { await load() }
        } else {
          ProgressView("Loading your month…")
        }
      }.navigationTitle("CardPilot").task(id: api.token) { await load() }.onChange(of: month) {
        Task { await load() }
      }
    }
  }
}
struct DiscoverView: View {
  @EnvironmentObject var api: API
  @State private var offers: [Offer] = []
  @State private var query = ""
  @State private var loaded = false
  @State private var error: String?
  func load() async {
    do {
      let response: OffersResponse = try await api.request("/api/offers")
      offers = response.offers
      loaded = true
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  var body: some View {
    NavigationStack {
      Group {
        if let error {
          LoadError(error: error) { Task { await load() } }
        } else if !loaded {
          ProgressView()
        } else {
          List {
            Notice(text: "Public reporting does not establish your personal eligibility.")
            ForEach(
              offers.filter { query.isEmpty || $0.merchant.localizedCaseInsensitiveContains(query) }
            ) { offer in
              NavigationLink {
                OfferDetail(offer: offer)
              } label: {
                VStack(alignment: .leading, spacing: 5) {
                  Text(offer.merchant).font(.headline)
                  Text(offer.title)
                  Text("\(offer.verificationStatus) • \(offer.freshness ?? "unknown")").font(
                    .caption
                  ).foregroundStyle(.secondary)
                }
              }
            }
            if offers.isEmpty { Text("No offers found") }
          }.refreshable { await load() }.searchable(text: $query, prompt: "Merchant")
        }
      }.navigationTitle("Discover").task(id: api.token) { await load() }
    }
  }
}
struct OfferDetail: View {
  @EnvironmentObject var api: API
  let offer: Offer
  @State private var attested = false
  @State private var rewardAmount = "0"
  @State private var error: String?
  struct Result: Decodable { let ok: Bool }
  var body: some View {
    List {
      Section(offer.merchant) {
        Text(offer.title).font(.title2)
        LabeledContent("Expires", value: offer.expiresAt)
        LabeledContent("Source", value: offer.verificationStatus)
        LabeledContent("Eligibility", value: offer.availability ?? offer.personalEligibility)
        LabeledContent(
          "Usage", value: attested ? "confirmed_used (your attestation)" : offer.usage ?? "unused")
      }
      Section {
        Notice(
          text:
            "A charge match is only possible use. Confirm only after seeing a statement credit or other reward evidence."
        )
        if offer.targeted {
          Notice(
            text:
              "Targeted offer: personal eligibility is unknown. Check and activate manually with your issuer."
          )
        }
        Link("View original source", destination: URL(string: offer.sourceUrl)!)
        TextField("Reward received in cents", text: $rewardAmount).keyboardType(.numberPad)
        Button(attested ? "Remove my confirmation" : "Attest reward received") {
          Task {
            do {
              guard let received = Int(rewardAmount), received >= 0 else { throw URLError(.badURL) }
              let _: Result = try await api.request(
                "/api/offers/\(offer.id)/confirmation", method: "PATCH",
                body: JSONSerialization.data(withJSONObject: [
                  "confirmed": !attested, "amountMinor": received,
                ]))
              attested.toggle()
            } catch { self.error = error.localizedDescription }
          }
        }
        if let error { Text(error).foregroundStyle(.red) }
      }
    }.navigationTitle("Offer details").onAppear { attested = offer.usage == "confirmed_used" }
  }
}
struct SpendingView: View {
  @EnvironmentObject var api: API
  @State private var transactions: [Transaction] = []
  @State private var error: String?
  @State private var loaded = false
  @State private var member = "all"
  func load() async {
    do {
      let response: TransactionsResponse = try await api.request("/api/transactions?month=2026-11")
      transactions = response.transactions
      loaded = true
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  var filtered: [Transaction] { transactions.filter { member == "all" || $0.member == member } }
  var body: some View {
    NavigationStack {
      Group {
        if let error {
          LoadError(error: error) { Task { await load() } }
        } else if !loaded {
          ProgressView()
        } else {
          List {
            Section {
              Picker("Member", selection: $member) {
                Text("Shared detail").tag("all")
                Text("Person A").tag("person_a")
                Text("Person B").tag("person_b")
              }
              LabeledContent(
                "Posted purchases",
                value: money(
                  filtered.filter { !$0.pending && $0.category != "transfer" }.reduce(0) {
                    $0 + $1.amountMinor
                  }))
              Notice(
                text:
                  "Pending purchases and card payments are excluded. Sharing follows each member’s consent."
              )
            }
            ForEach(filtered) { t in
              HStack {
                VStack(alignment: .leading) {
                  Text(t.merchant)
                  Text("\(t.member) • \(t.date) • \(t.category)").font(.caption).foregroundStyle(
                    .secondary)
                  if t.pending { Text("Pending").font(.caption).foregroundStyle(.orange) }
                }
                Spacer()
                Text(money(t.amountMinor))
              }
            }
            if filtered.isEmpty { Text("No transactions in this view") }
          }.refreshable { await load() }
        }
      }.navigationTitle("Spending").task(id: api.token) { await load() }
    }
  }
}
struct WalletView: View {
  @EnvironmentObject var api: API
  @State private var cards: [Card] = []
  @State private var error: String?
  @State private var loaded = false
  func load() async {
    do {
      let response: CardsResponse = try await api.request("/api/cards")
      cards = response.cards
      loaded = true
      error = nil
    } catch { self.error = error.localizedDescription }
  }
  var body: some View {
    NavigationStack {
      Group {
        if let error {
          LoadError(error: error) { Task { await load() } }
        } else if !loaded {
          ProgressView()
        } else {
          List {
            NavigationLink("Add a primary card") { AddCardView() }
            NavigationLink("Compare purchase rewards") { RecommendationView() }
            Notice(
              text:
                "Fixture ownership is a placeholder. Confirm product mappings after connecting Plaid."
            )
            ForEach(cards) { c in
              VStack(alignment: .leading, spacing: 5) {
                Label(c.displayName, systemImage: "creditcard.fill").font(.headline)
                Text("\(c.owner) • \(c.relationship)").font(.subheadline)
                if let primary = c.primaryId {
                  Text("Shared benefit account: \(primary)").font(.caption).foregroundStyle(
                    .secondary)
                }
              }
            }
          }.refreshable { await load() }
        }
      }.navigationTitle("Wallet").task(id: api.token) { await load() }
    }
  }
}
struct SettingsView: View {
  @EnvironmentObject var api: API
  @State private var sources: [Source] = []
  @State private var consent = "detail"
  @State private var status: String?
  @State private var confirmDelete = false
  struct OK: Decodable { let ok: Bool }
  struct Consent: Decodable { let consent: String }
  var body: some View {
    NavigationStack {
      Form {
        Section("Connection") {
          TextField("API URL", text: $api.baseURL).textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          SecureField("Provider JWT (memory only)", text: $api.token).textInputAutocapitalization(
            .never
          ).autocorrectionDisabled()
          Picker("Demo member", selection: $api.token) {
            Text("Person A").tag("demo-a")
            Text("Person B").tag("demo-b")
          }
          Notice(
            text:
              "Demo tokens work only on a mock server. Provider mode requires an identity-provider JWT."
          )
        }
        HouseholdSetupView()
        PlaidConnectView()
        Section {
          NavigationLink("Manage institutions and account mapping") { PlaidAccountsView() }
        }
        Section("Privacy") {
          Picker("Transaction sharing", selection: $consent) {
            Text("Private").tag("private")
            Text("Totals only").tag("summary")
            Text("Details").tag("detail")
          }
          Button("Save consent") {
            Task {
              do {
                let _: Consent = try await api.request(
                  "/api/me/consent", method: "PATCH",
                  body: JSONSerialization.data(withJSONObject: ["consent": consent]))
                status = "Sharing preference saved"
              } catch { status = error.localizedDescription }
            }
          }
          Button("Erase my data", role: .destructive) { confirmDelete = true }
        }
        Section("Public sources") {
          ForEach(sources) { source in
            VStack(alignment: .leading) {
              Text(source.kind)
              Link(source.url, destination: URL(string: source.url)!)
              Text(source.allowed ? "Approved" : "Access-policy review required").font(.caption)
              Button("Check source") {
                Task {
                  do {
                    let result: StatusResponse = try await api.request(
                      "/api/sources/\(source.id)/check", method: "POST")
                    status = result.reason ?? result.status
                  } catch { status = error.localizedDescription }
                }
              }
            }
          }
        }
        Section {
          Notice(
            text:
              "No automated bank logins. Plaid supplies transactions, not personal issuer offers or redemption confirmation. Point values are assumptions."
          )
          if let status { Text(status) }
        }
      }.navigationTitle("Settings").task {
        do {
          let response: SourcesResponse = try await api.request("/api/sources")
          sources = response.sources
        } catch { status = error.localizedDescription }
      }
      .confirmationDialog(
        "Erase this member’s cards, transactions and confirmations?", isPresented: $confirmDelete
      ) {
        Button("Erase my data", role: .destructive) {
          Task {
            do {
              let _: OK = try await api.request("/api/me/data", method: "DELETE")
              status = "Data erased. Re-seed server to restore demo."
            } catch { status = error.localizedDescription }
          }
        }
      }
    }
  }
}
