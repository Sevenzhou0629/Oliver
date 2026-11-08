import SwiftUI

struct HouseholdSetupView: View {
  @EnvironmentObject var api: API
  @State private var name = "Our household"
  @State private var householdID = ""
  @State private var invitationID = ""
  @State private var recipient = ""
  @State private var status: String?
  struct Created: Decodable { let id: String }
  struct OK: Decodable { let ok: Bool }
  var body: some View {
    Section("Household membership") {
      TextField("New household name", text: $name)
      Button("Create household") {
        Task {
          do {
            let created: Created = try await api.request(
              "/api/households", method: "POST",
              body: JSONSerialization.data(withJSONObject: ["name": name]))
            api.household = created.id
            householdID = created.id
            status = "Created household \(created.id)"
          } catch {
            status = "Creation unavailable. Existing members already belong to a household."
          }
        }
      }
      TextField("Intended recipient’s identity subject", text: $recipient)
        .textInputAutocapitalization(.never)
      Button("Generate invitation") {
        Task {
          do {
            let created: Created = try await api.request(
              "/api/households/\(api.household)/invitations", method: "POST",
              body: JSONSerialization.data(withJSONObject: ["recipient": recipient]))
            status =
              "Share household \(api.household) and invitation \(created.id) with the intended member."
          } catch { status = "Invitation unavailable" }
        }
      }
      TextField("Household ID to join", text: $householdID).textInputAutocapitalization(.never)
      TextField("Invitation ID", text: $invitationID).textInputAutocapitalization(.never)
      Button("Accept invitation and join privately") {
        Task {
          do {
            let _: OK = try await api.request(
              "/api/households/\(householdID)/join", method: "POST",
              body: JSONSerialization.data(withJSONObject: [
                "invitationId": invitationID, "consent": true,
              ]))
            api.household = householdID
            status = "Joined with private transaction sharing. Change consent separately."
          } catch { status = "Invitation invalid, wrong recipient, or household full" }
        }
      }
      if let status { Text(status).textSelection(.enabled).font(.footnote) }
    }
  }
}
