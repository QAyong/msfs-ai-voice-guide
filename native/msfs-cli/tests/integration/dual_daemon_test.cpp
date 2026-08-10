#include "common/json.h"
#include "common/win_pipe.h"

#include <chrono>
#include <atomic>
#include <iostream>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace {

bool has_role(const std::optional<std::string>& response, const std::string& role) {
    return response.has_value() && msfs::json::string_at(*response, "role").value_or("") == role;
}

std::optional<std::string> request(const std::string& role, const std::string& id, std::string& error) {
    const auto parsed = msfs::pipe::parse_role(role);
    if (!parsed.has_value()) return std::nullopt;
    const auto payload = msfs::json::object({
        {"id", msfs::json::quote(id)},
        {"role", msfs::json::quote(role)},
    });
    for (int attempt = 0; attempt < 20; ++attempt) {
        if (const auto response = msfs::pipe::transact(payload, error, msfs::pipe::pipe_name(*parsed));
            response.has_value()) {
            return response;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
    }
    return std::nullopt;
}

bool run_parallel_role_pipe_test() {
    std::string monitor_error;
    std::string ai_error;
    bool monitor_served = false;
    bool ai_served = false;

    const auto handler = [](const std::string& raw_request) {
        const std::string role = msfs::json::string_at(raw_request, "role").value_or("unknown");
        std::this_thread::sleep_for(role == "monitor" ? std::chrono::milliseconds(25)
                                                       : std::chrono::milliseconds(75));
        return msfs::json::ok("dual-daemon-test", msfs::json::object({
            {"role", msfs::json::quote(role)},
        }));
    };

    std::thread monitor_server([&] {
        monitor_served = msfs::pipe::serve_once(
            handler, monitor_error, msfs::pipe::pipe_name(msfs::pipe::DaemonRole::monitor));
    });
    std::thread ai_server([&] {
        ai_served = msfs::pipe::serve_once(
            handler, ai_error, msfs::pipe::pipe_name(msfs::pipe::DaemonRole::ai));
    });

    std::optional<std::string> monitor_response;
    std::optional<std::string> ai_response;
    std::thread monitor_client([&] { monitor_response = request("monitor", "dual-daemon-test-monitor", monitor_error); });
    std::thread ai_client([&] { ai_response = request("ai", "dual-daemon-test-ai", ai_error); });

    monitor_client.join();
    ai_client.join();
    monitor_server.join();
    ai_server.join();

    if (!monitor_served || !ai_served || !has_role(monitor_response, "monitor") ||
        !has_role(ai_response, "ai")) {
        std::cerr << "Dual daemon role pipe test failed: "
                  << (monitor_error.empty() ? ai_error : monitor_error) << '\n';
        return false;
    }
    return true;
}

bool run_parallel_pressure_test() {
    constexpr int kRounds = 30;
    std::atomic<int> monitor_served = 0;
    std::atomic<int> ai_served = 0;
    std::string monitor_server_error;
    std::string ai_server_error;

    const auto handler = [](const std::string& raw_request) {
        const std::string role = msfs::json::string_at(raw_request, "role").value_or("unknown");
        const std::string id = msfs::json::string_at(raw_request, "id").value_or("unknown");
        std::this_thread::sleep_for(role == "monitor" ? std::chrono::milliseconds(3)
                                                       : std::chrono::milliseconds(7));
        return msfs::json::ok(id, msfs::json::object({
            {"role", msfs::json::quote(role)},
        }));
    };

    std::thread monitor_server([&] {
        while (monitor_served.load() < kRounds) {
            if (msfs::pipe::serve_once(handler, monitor_server_error,
                                       msfs::pipe::pipe_name(msfs::pipe::DaemonRole::monitor))) {
                ++monitor_served;
            }
        }
    });
    std::thread ai_server([&] {
        while (ai_served.load() < kRounds) {
            if (msfs::pipe::serve_once(handler, ai_server_error,
                                       msfs::pipe::pipe_name(msfs::pipe::DaemonRole::ai))) {
                ++ai_served;
            }
        }
    });

    std::vector<std::optional<std::string>> monitor_responses(kRounds);
    std::vector<std::optional<std::string>> ai_responses(kRounds);
    std::vector<std::string> monitor_errors(kRounds);
    std::vector<std::string> ai_errors(kRounds);
    std::vector<std::thread> clients;
    clients.reserve(kRounds * 2);
    for (int index = 0; index < kRounds; ++index) {
        clients.emplace_back([&, index] {
            monitor_responses[index] = request("monitor", "pressure-monitor-" + std::to_string(index),
                                               monitor_errors[index]);
        });
        clients.emplace_back([&, index] {
            ai_responses[index] = request("ai", "pressure-ai-" + std::to_string(index), ai_errors[index]);
        });
    }
    for (auto& client : clients) client.join();
    monitor_server.join();
    ai_server.join();

    for (int index = 0; index < kRounds; ++index) {
        if (!has_role(monitor_responses[index], "monitor") || !has_role(ai_responses[index], "ai")) {
            const std::string error = !monitor_errors[index].empty() ? monitor_errors[index] : ai_errors[index];
            std::cerr << "Parallel pressure test failed at round " << index << ": " << error << '\n';
            return false;
        }
    }
    return true;
}

}  // namespace

int main() {
    return run_parallel_role_pipe_test() && run_parallel_pressure_test() ? 0 : 1;
}
