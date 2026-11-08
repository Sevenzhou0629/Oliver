import Foundation

@MainActor final class API: ObservableObject {
  @Published var token = "demo-a"
  @Published var household = "demo"
  @Published var baseURL = "http://127.0.0.1:3000"
  func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws
    -> T
  {
    guard let url = URL(string: baseURL + path), ["http", "https"].contains(url.scheme ?? "") else {
      throw URLError(.badURL)
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
}
