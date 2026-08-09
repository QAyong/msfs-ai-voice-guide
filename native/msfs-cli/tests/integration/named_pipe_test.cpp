#include "common/json.h"
#include "common/win_pipe.h"

#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

namespace {

constexpr wchar_t kTestPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-test";
constexpr wchar_t kBusyPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-busy-test";
constexpr auto kSlowRequestDuration = std::chrono::milliseconds(800);

std::optional<std::string> transact_after_server_starts(const std::string& request, std::string& error,
                                                         const wchar_t* pipe_name) {
    for (int attempt = 0; attempt < 10; ++attempt) {
        const auto response = msfs::pipe::transact(request, error, pipe_name);
        if (response.has_value()) return response;
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    return std::nullopt;
}

bool has_echo(const std::optional<std::string>& response, const std::string& expected) {
    if (!response.has_value()) return false;
    const auto echo = msfs::json::string_at(*response, "echo");
    return echo.has_value() && *echo == expected;
}

bool verify_busy_pipe_waits() {
    bool first_served = false;
    bool second_served = false;
    std::string server_error;
    std::mutex mutex;
    std::condition_variable first_request_started;
    bool slow_handler_started = false;

    std::thread server([&] {
        const auto handler = [&](const std::string& request) {
            const auto value = msfs::json::string_at(request, "value").value_or("missing");
            if (value == "first") {
                {
                    const std::lock_guard lock(mutex);
                    slow_handler_started = true;
                }
                first_request_started.notify_one();
                std::this_thread::sleep_for(kSlowRequestDuration);
            }
            return msfs::json::ok("pipe-test", msfs::json::object({
                {"echo", msfs::json::quote(value)},
            }));
        };

        first_served = msfs::pipe::serve_once(handler, server_error, kBusyPipeName);
        if (first_served) second_served = msfs::pipe::serve_once(handler, server_error, kBusyPipeName);
    });

    std::optional<std::string> first_response;
    std::string first_error;
    std::thread first_client([&] {
        first_response = transact_after_server_starts("{\"value\":\"first\"}", first_error, kBusyPipeName);
    });

    {
        std::unique_lock lock(mutex);
        if (!first_request_started.wait_for(lock, std::chrono::seconds(2), [&] { return slow_handler_started; })) {
            std::cerr << "Slow named pipe request did not start\n";
            first_client.join();
            std::string cleanup_error;
            (void)transact_after_server_starts("{\"value\":\"cleanup-first\"}", cleanup_error, kBusyPipeName);
            (void)transact_after_server_starts("{\"value\":\"cleanup-second\"}", cleanup_error, kBusyPipeName);
            server.join();
            return false;
        }
    }

    const auto second_started_at = std::chrono::steady_clock::now();
    std::string second_error;
    const auto second_response = msfs::pipe::transact("{\"value\":\"second\"}", second_error, kBusyPipeName);
    const auto second_elapsed = std::chrono::steady_clock::now() - second_started_at;
    first_client.join();

    // The old 500ms timeout fails before the first handler completes. Connect
    // once after it completes so the finite two-request server can exit cleanly
    // and report that regression instead of hanging this test.
    if (!second_response.has_value()) {
        std::string cleanup_error;
        (void)transact_after_server_starts("{\"value\":\"cleanup\"}", cleanup_error, kBusyPipeName);
    }
    server.join();

    if (!first_served || !second_served || !has_echo(first_response, "first") ||
        !has_echo(second_response, "second")) {
        std::cerr << "Busy named pipe exchange failed: "
                  << (server_error.empty() ? (second_error.empty() ? first_error : second_error) : server_error) << '\n';
        return false;
    }
    if (second_elapsed < std::chrono::milliseconds(500)) {
        std::cerr << "Second client did not wait for the busy pipe\n";
        return false;
    }
    return true;
}

}  // namespace

int main() {
    bool served = false;
    std::string server_error;
    std::thread server([&] {
        served = msfs::pipe::serve_once(
            [](const std::string& request) {
                const auto value = msfs::json::string_at(request, "value");
                return msfs::json::ok("pipe-test", msfs::json::object({
                    {"echo", msfs::json::quote(value.value_or("missing"))},
                }));
            },
            server_error, kTestPipeName);
    });

    std::string client_error;
    const auto response = transact_after_server_starts("{\"value\":\"native-pipe\"}", client_error, kTestPipeName);
    server.join();

    if (!served || !has_echo(response, "native-pipe")) {
        std::cerr << "Named pipe exchange failed: " << (server_error.empty() ? client_error : server_error) << '\n';
        return 1;
    }
    return verify_busy_pipe_waits() ? 0 : 1;
}
