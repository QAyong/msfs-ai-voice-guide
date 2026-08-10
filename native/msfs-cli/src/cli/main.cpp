#include "common/json.h"
#include "common/win_pipe.h"
#include "external/geo_context.h"

#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <thread>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

struct Arguments final {
    std::vector<std::string> positional;
    std::unordered_map<std::string, std::string> options;
};

std::string utf8(const wchar_t* value) {
    if (value == nullptr) return {};
    const int size = WideCharToMultiByte(CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
    if (size <= 1) return {};
    std::string output(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value, -1, output.data(), size, nullptr, nullptr);
    output.resize(static_cast<size_t>(size - 1));
    return output;
}

Arguments read_arguments(int argc, wchar_t* argv[]) {
    Arguments parsed;
    for (int index = 1; index < argc; ++index) {
        const std::string value = utf8(argv[index]);
        if (!value.starts_with("--")) {
            parsed.positional.push_back(value);
            continue;
        }
        const std::string key = value.substr(2);
        if (index + 1 < argc && !utf8(argv[index + 1]).starts_with("--")) {
            parsed.options[key] = utf8(argv[++index]);
        } else {
            parsed.options[key] = "true";
        }
    }
    return parsed;
}

std::string option(const Arguments& args, const std::string& name) {
    const auto it = args.options.find(name);
    return it == args.options.end() ? std::string{} : it->second;
}

msfs::pipe::DaemonRole daemon_role(const Arguments& args, bool& valid) {
    const std::string value = option(args, "role");
    if (value.empty()) return msfs::pipe::DaemonRole::ai;
    const auto parsed = msfs::pipe::parse_role(value);
    valid = parsed.has_value();
    return parsed.value_or(msfs::pipe::DaemonRole::ai);
}

std::string request_id() {
    return "cli-" + std::to_string(GetCurrentProcessId()) + "-" +
           std::to_string(GetTickCount64());
}

std::string request_json(const std::string& command, const std::vector<std::pair<std::string, std::string>>& fields) {
    std::vector<std::pair<std::string, std::string>> all_fields{
        {"id", msfs::json::quote(request_id())},
        {"command", msfs::json::quote(command)},
    };
    for (const auto& [key, value] : fields) all_fields.emplace_back(key, msfs::json::quote(value));
    return msfs::json::object(all_fields);
}

std::optional<std::string> transact_daemon(const std::string& request, std::string& error_message,
                                           msfs::pipe::DaemonRole role = msfs::pipe::DaemonRole::ai,
                                           bool start_if_missing = true);

bool start_daemon(const msfs::pipe::DaemonRole role, std::string& error_message) {
    wchar_t executable_path[MAX_PATH]{};
    if (GetModuleFileNameW(nullptr, executable_path, MAX_PATH) == 0) {
        error_message = "GetModuleFileNameW failed.";
        return false;
    }
    std::wstring daemon_path(executable_path);
    const size_t slash = daemon_path.find_last_of(L"\\/");
    daemon_path = daemon_path.substr(0, slash + 1) + L"msfsd.exe";

    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process{};
    const wchar_t* role_argument = role == msfs::pipe::DaemonRole::monitor ? L"monitor" : L"ai";
    std::wstring command_line = L"\"" + daemon_path + L"\" --role " + role_argument;
    if (!CreateProcessW(daemon_path.c_str(), command_line.data(), nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) {
        error_message = "Unable to start msfsd.exe (Win32 error " + std::to_string(GetLastError()) + ").";
        return false;
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return true;
}

std::string usage_error() {
    return msfs::json::error("cli", "USAGE", "Supported commands: status; daemon stop; system state; catalog simvar search/show; catalog event search; simvar get/set/batch/watch; key-event send; input list/set; facilities nearest; flight load; ai aircraft create-parked; camera acquire/release/status; route get/status/watch; external geo context.");
}

std::string build_request(const Arguments& args, bool& valid) {
    valid = true;
    if (args.positional.size() == 2 && args.positional[0] == "daemon" && args.positional[1] == "stop") {
        return request_json("daemon.stop", {});
    }
    if (args.positional.size() == 1 && args.positional[0] == "status") {
        return request_json("status", {});
    }
    if (args.positional.size() == 3 && args.positional[0] == "catalog" &&
        args.positional[1] == "simvar" && args.positional[2] == "search") {
        return request_json("catalog.simvar.search", {{"query", option(args, "query")}});
    }
    if (args.positional.size() == 3 && args.positional[0] == "catalog" &&
        args.positional[1] == "simvar" && args.positional[2] == "show") {
        return request_json("catalog.simvar.show", {{"name", option(args, "name")}});
    }
    if (args.positional.size() == 3 && args.positional[0] == "catalog" &&
        args.positional[1] == "event" && args.positional[2] == "search") {
        return request_json("catalog.event.search", {{"query", option(args, "query")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "simvar" && args.positional[1] == "get") {
        return request_json("simvar.get", {{"name", option(args, "name")}, {"unit", option(args, "unit")}, {"datatype", option(args, "datatype")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "simvar" && args.positional[1] == "set") {
        return request_json("simvar.set", {{"name", option(args, "name")}, {"unit", option(args, "unit")}, {"value", option(args, "value")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "simvar" && args.positional[1] == "batch") {
        return request_json("simvar.batch", {{"items", option(args, "items")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "key-event" && args.positional[1] == "send") {
        return request_json("key-event.send", {{"name", option(args, "name")}, {"data", option(args, "data")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "system" && args.positional[1] == "state") {
        return request_json("system.state", {{"name", option(args, "name")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "input" && args.positional[1] == "list") {
        return request_json("input.list", {});
    }
    if (args.positional.size() == 2 && args.positional[0] == "input" && args.positional[1] == "set") {
        return request_json("input.set", {{"hash", option(args, "hash")}, {"value", option(args, "value")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "facilities" && args.positional[1] == "nearest") {
        return request_json("facilities.nearest", {{"type", option(args, "type")}, {"radius-nm", option(args, "radius-nm")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "flight" && args.positional[1] == "load") {
        return request_json("flight.load", {{"path", option(args, "path")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 3 && args.positional[0] == "ai" && args.positional[1] == "aircraft" && args.positional[2] == "create-parked") {
        return request_json("ai.aircraft.create-parked", {{"title", option(args, "title")}, {"tail", option(args, "tail")}, {"airport", option(args, "airport")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "camera" && args.positional[1] == "acquire") {
        return request_json("camera.acquire", {{"client-id", option(args, "client-id")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "camera" && args.positional[1] == "release") {
        return request_json("camera.release", {{"definition", option(args, "definition")}, {"unsafe", option(args, "unsafe")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "camera" && args.positional[1] == "status") {
        return request_json("camera.status", {});
    }
    if (args.positional.size() == 2 && args.positional[0] == "route" && args.positional[1] == "get") {
        return request_json("route.get", {{"source", option(args, "source")}});
    }
    if (args.positional.size() == 2 && args.positional[0] == "route" && args.positional[1] == "status") {
        return request_json("route.status", {});
    }
    valid = false;
    return {};
}

int run_watch(const Arguments& args, const std::string& command,
              const std::vector<std::pair<std::string, std::string>>& fields,
              const msfs::pipe::DaemonRole role) {
    const int interval_ms = std::max(100, std::atoi(option(args, "interval-ms").empty() ? "1000" : option(args, "interval-ms").c_str()));
    const int count = std::max(0, std::atoi(option(args, "count").c_str()));
    for (int iteration = 0; count == 0 || iteration < count; ++iteration) {
        std::string pipe_error;
        const auto response = transact_daemon(request_json(command, fields), pipe_error, role);
        std::cout << (response.has_value() ? *response : msfs::json::error("cli", "DAEMON_UNAVAILABLE", pipe_error)) << '\n';
        if (!response.has_value()) return 1;
        if (count == 0 || iteration + 1 < count) std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
    }
    return 0;
}

std::optional<std::string> transact_daemon(const std::string& request, std::string& error_message,
                                           const msfs::pipe::DaemonRole role,
                                           const bool start_if_missing) {
    auto response = msfs::pipe::transact(request, error_message, msfs::pipe::pipe_name(role));
    if (response.has_value()) return response;
    if (!start_if_missing) return std::nullopt;
    if (!start_daemon(role, error_message)) return std::nullopt;
    for (int attempt = 0; attempt < 20 && !response.has_value(); ++attempt) {
        Sleep(100);
        response = msfs::pipe::transact(request, error_message, msfs::pipe::pipe_name(role));
    }
    return response;
}

std::optional<double> required_number_option(const Arguments& args, const std::string& name, std::string& error_message) {
    const std::string value = option(args, name);
    if (value.empty()) {
        error_message = "Missing --" + name + ".";
        return std::nullopt;
    }
    const char* begin = value.c_str();
    char* end = nullptr;
    const double parsed = std::strtod(begin, &end);
    if (end == begin || *end != '\0') {
        error_message = "--" + name + " must be a number.";
        return std::nullopt;
    }
    return parsed;
}

std::optional<double> aircraft_simvar(const std::string& name, const std::string& unit,
                                      std::string& error_message,
                                      const msfs::pipe::DaemonRole role) {
    const auto response = transact_daemon(request_json("simvar.get", {{"name", name}, {"unit", unit}}), error_message, role);
    if (!response.has_value()) return std::nullopt;
    const auto value = msfs::json::number_at(*response, "value");
    if (!value.has_value()) {
        error_message = *response;
        return std::nullopt;
    }
    return value;
}

int run_external_geo_context(const Arguments& args, const msfs::pipe::DaemonRole role) {
    const bool from_aircraft = option(args, "from") == "aircraft";
    const bool has_direct_coordinates = !option(args, "lat").empty() || !option(args, "lon").empty();
    if (from_aircraft == has_direct_coordinates) {
        std::cout << msfs::json::error("cli", "USAGE", "Use exactly one coordinate source: --from aircraft or --lat and --lon.") << '\n';
        return 2;
    }

    msfs::external::geo::ContextRequest request{};
    request.detail = option(args, "detail");
    if (request.detail.empty()) request.detail = "auto";
    request.locale = option(args, "locale");
    if (request.locale.empty()) request.locale = "zh-CN";

    std::string error_message;
    if (from_aircraft) {
        const auto latitude = aircraft_simvar("PLANE LATITUDE", "degrees", error_message, role);
        if (!latitude.has_value()) {
            std::cout << msfs::json::error("cli", "SIM_POSITION_UNAVAILABLE", error_message) << '\n';
            return 1;
        }
        const auto longitude = aircraft_simvar("PLANE LONGITUDE", "degrees", error_message, role);
        if (!longitude.has_value()) {
            std::cout << msfs::json::error("cli", "SIM_POSITION_UNAVAILABLE", error_message) << '\n';
            return 1;
        }
        const auto altitude = aircraft_simvar("PLANE ALTITUDE", "meters", error_message, role);
        if (!altitude.has_value()) {
            std::cout << msfs::json::error("cli", "SIM_POSITION_UNAVAILABLE", error_message) << '\n';
            return 1;
        }
        request.latitude = *latitude;
        request.longitude = *longitude;
        request.altitude_m = *altitude;
    } else {
        const auto latitude = required_number_option(args, "lat", error_message);
        const auto longitude = required_number_option(args, "lon", error_message);
        if (!latitude.has_value() || !longitude.has_value()) {
            std::cout << msfs::json::error("cli", "USAGE", error_message) << '\n';
            return 2;
        }
        request.latitude = *latitude;
        request.longitude = *longitude;
        if (!option(args, "alt-m").empty()) {
            const auto altitude = required_number_option(args, "alt-m", error_message);
            if (!altitude.has_value()) {
                std::cout << msfs::json::error("cli", "USAGE", error_message) << '\n';
                return 2;
            }
            request.altitude_m = *altitude;
        }
    }

    msfs::external::geo::Config config{};
    if (!msfs::external::geo::load_config(config, error_message)) {
        std::cout << msfs::json::error("cli", "EXTERNAL_GEO_CONFIG_INVALID", error_message) << '\n';
        return 1;
    }
    auto client = msfs::external::geo::create_client(config, error_message);
    if (!client) {
        std::cout << msfs::json::error("cli", "EXTERNAL_GEO_BACKEND_UNAVAILABLE", error_message) << '\n';
        return 1;
    }
    const auto result = client->context(request);
    if (!result.ok) {
        std::cout << msfs::json::error("cli", result.error_code, result.message) << '\n';
        return 1;
    }
    std::cout << msfs::json::ok(request_id(), msfs::json::object({
        {"origin", msfs::json::quote("external_geo_cloud")},
        {"context", result.body_json},
    })) << '\n';
    return 0;
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
    const Arguments arguments = read_arguments(argc, argv);
    bool role_valid = true;
    const auto role = daemon_role(arguments, role_valid);
    if (!role_valid) {
        std::cout << msfs::json::error("cli", "USAGE", "--role must be monitor or ai.") << '\n';
        return 2;
    }
    if (arguments.positional.size() == 3 && arguments.positional[0] == "external" &&
        arguments.positional[1] == "geo" && arguments.positional[2] == "context") {
        return run_external_geo_context(arguments, role);
    }
    if (arguments.positional.size() == 2 && arguments.positional[0] == "simvar" && arguments.positional[1] == "watch") {
        if (option(arguments, "name").empty() || option(arguments, "unit").empty()) {
            std::cout << msfs::json::error("cli", "USAGE", "simvar watch requires --name and --unit.") << '\n';
            return 2;
        }
        return run_watch(arguments, "simvar.get", {{"name", option(arguments, "name")}, {"unit", option(arguments, "unit")}, {"datatype", option(arguments, "datatype")}}, role);
    }
    if (arguments.positional.size() == 2 && arguments.positional[0] == "route" && arguments.positional[1] == "watch") {
        return run_watch(arguments, "route.get", {{"source", "efb"}}, role);
    }
    bool valid = false;
    const std::string request = build_request(arguments, valid);
    if (!valid) {
        std::cout << usage_error() << '\n';
        return 2;
    }

    const bool is_daemon_stop = arguments.positional.size() == 2 &&
                                arguments.positional[0] == "daemon" &&
                                arguments.positional[1] == "stop";
    std::string pipe_error;
    const auto response = transact_daemon(request, pipe_error, role, !is_daemon_stop);
    if (!response.has_value()) {
        if (is_daemon_stop) {
            std::cout << msfs::json::ok(request_id(), msfs::json::object({
                {"stopped", "false"},
                {"already_stopped", "true"},
            })) << '\n';
            return 0;
        }
        std::cout << msfs::json::error("cli", "DAEMON_UNAVAILABLE", pipe_error) << '\n';
        return 1;
    }

    std::cout << *response << '\n';
    return response->find("\"ok\":true") != std::string::npos ? 0 : 1;
}
