#include "catalog/catalog.h"
#include "common/json.h"
#include "common/win_pipe.h"
#include "simconnect/simconnect_client.h"

#include <windows.h>

#include <array>
#include <atomic>
#include <charconv>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

namespace {

std::string require_field(const std::string& request, const std::string& key, bool& valid) {
    const auto value = msfs::json::string_at(request, key);
    if (!value.has_value()) {
        valid = false;
        return {};
    }
    return *value;
}

bool unsafe_allowed(const std::string& request) {
    return msfs::json::string_at(request, "unsafe").value_or("") == "true";
}

std::optional<double> number_field(const std::string& request, const std::string& key) {
    const auto value = msfs::json::string_at(request, key);
    if (!value.has_value()) return std::nullopt;
    char* end = nullptr;
    const double parsed = std::strtod(value->c_str(), &end);
    return end != value->c_str() && *end == '\0' ? std::optional<double>(parsed) : std::nullopt;
}

std::string result_error(const std::string& id, const msfs::simconnect::Result& result) {
    return msfs::json::error(id, result.error_code, result.message);
}

std::vector<std::string> split(const std::string& value, char delimiter) {
    std::vector<std::string> result;
    size_t begin = 0;
    while (begin <= value.size()) {
        const size_t end = value.find(delimiter, begin);
        result.push_back(value.substr(begin, end == std::string::npos ? std::string::npos : end - begin));
        if (end == std::string::npos) break;
        begin = end + 1;
    }
    return result;
}

std::string json_array(const std::vector<std::string>& values) {
    std::string result = "[";
    for (size_t index = 0; index < values.size(); ++index) {
        if (index != 0) result += ',';
        result += values[index];
    }
    return result + "]";
}

std::string handle_request(const std::string& request, msfs::simconnect::SimConnectClient& simconnect,
                           std::atomic_bool& stop_requested) {
    const std::string id = msfs::json::string_at(request, "id").value_or("unknown");
    const auto command = msfs::json::string_at(request, "command");
    if (!command.has_value()) {
        return msfs::json::error(id, "INVALID_REQUEST", "Missing request command.");
    }

    if (*command == "daemon.stop") {
        stop_requested.store(true);
        return msfs::json::ok(id, msfs::json::object({{"stopping", "true"}}));
    }

    if (*command == "status") {
        return msfs::json::ok(id, msfs::json::object({
            {"daemon", msfs::json::quote("ready")},
            {"simconnect", simconnect.status_json()},
            {"route_bridge", msfs::json::object({
                {"transport", msfs::json::quote("SimConnect CommBus")},
                {"installed", msfs::json::quote("unknown; use route get to probe the loaded Community Package")},
            })},
        }));
    }

    if (*command == "catalog.simvar.search") {
        return msfs::json::ok(id, msfs::catalog::search_simvars_json(msfs::json::string_at(request, "query").value_or("")));
    }
    if (*command == "catalog.simvar.show") {
        bool valid = true;
        const std::string name = require_field(request, "name", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "Missing SimVar name.");
        const std::string result = msfs::catalog::show_simvar_json(name);
        if (result.empty()) return msfs::json::error(id, "CATALOG_NOT_FOUND", "SimVar is not present in the seed catalog.");
        return msfs::json::ok(id, result);
    }
    if (*command == "catalog.event.search") {
        return msfs::json::ok(id, msfs::catalog::search_events_json(msfs::json::string_at(request, "query").value_or("")));
    }
    if (*command == "simvar.get") {
        bool valid = true;
        const std::string name = require_field(request, "name", valid);
        const std::string unit = require_field(request, "unit", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "simvar.get requires --name and --unit.");
        const std::string datatype = msfs::json::string_at(request, "datatype").value_or("float64");
        const auto result = datatype == "string" ? simconnect.get_string(name, unit) : simconnect.get_float64(name, unit);
        if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({
            {"name", msfs::json::quote(name)},
            {"unit", msfs::json::quote(unit)},
            {"datatype", msfs::json::quote(datatype == "string" ? "STRING256" : "FLOAT64")},
            {"value", result.value_json},
        }));
    }
    if (*command == "simvar.set") {
        bool valid = true;
        const std::string name = require_field(request, "name", valid);
        const std::string unit = require_field(request, "unit", valid);
        const auto value = number_field(request, "value");
        if (!valid || !value.has_value()) return msfs::json::error(id, "INVALID_REQUEST", "simvar.set requires --name, --unit and numeric --value.");
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "simvar.set changes simulator state; repeat with --unsafe.");
        const auto result = simconnect.set_float64(name, unit, *value);
        if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"name", msfs::json::quote(name)}, {"unit", msfs::json::quote(unit)}, {"value", std::to_string(*value)}, {"set", "true"}}));
    }
    if (*command == "simvar.batch") {
        const std::string items = msfs::json::string_at(request, "items").value_or("");
        if (items.empty()) return msfs::json::error(id, "INVALID_REQUEST", "simvar.batch requires --items 'NAME|unit;NAME|unit'.");
        std::vector<std::string> rows;
        for (const auto& item : split(items, ';')) {
            const auto parts = split(item, '|');
            if (parts.size() != 2 || parts[0].empty() || parts[1].empty()) return msfs::json::error(id, "INVALID_REQUEST", "Each batch item must be NAME|unit.");
            const auto result = simconnect.get_float64(parts[0], parts[1]);
            if (!result.ok) return result_error(id, result);
            rows.push_back(msfs::json::object({{"name", msfs::json::quote(parts[0])}, {"unit", msfs::json::quote(parts[1])}, {"datatype", msfs::json::quote("FLOAT64")}, {"value", result.value_json}}));
        }
        return msfs::json::ok(id, msfs::json::object({{"items", json_array(rows)}}));
    }
    if (*command == "key-event.send") {
        bool valid = true;
        const std::string name = require_field(request, "name", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "key-event.send requires --name.");
        if (!unsafe_allowed(request)) {
            return msfs::json::error(id, "UNSAFE_REQUIRED", "key-event.send changes simulator state; repeat with --unsafe.");
        }
        std::array<std::uint32_t, 5> data{};
        const std::string raw_data = msfs::json::string_at(request, "data").value_or("");
        if (!raw_data.empty()) {
            const auto values = split(raw_data, ',');
            if (values.size() > data.size()) return msfs::json::error(id, "INVALID_REQUEST", "--data accepts at most five unsigned integer values.");
            for (size_t index = 0; index < values.size(); ++index) {
                const auto [end, code] = std::from_chars(values[index].data(), values[index].data() + values[index].size(), data[index]);
                if (code != std::errc{} || end != values[index].data() + values[index].size()) return msfs::json::error(id, "INVALID_REQUEST", "--data values must be unsigned integers.");
            }
        }
        const auto result = simconnect.send_key_event(name, data);
        if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({
            {"name", msfs::json::quote(name)},
            {"sent", "true"},
        }));
    }
    if (*command == "system.state") {
        bool valid = true; const std::string name = require_field(request, "name", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "system.state requires --name.");
        const auto result = simconnect.get_system_state(name); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"name", msfs::json::quote(name)}, {"value", result.value_json}}));
    }
    if (*command == "input.list") {
        const auto result = simconnect.list_input_events(); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"events", result.value_json}}));
    }
    if (*command == "input.set") {
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "input.set changes simulator state; repeat with --unsafe.");
        const auto hash_text = msfs::json::string_at(request, "hash"); const auto value = number_field(request, "value");
        if (!hash_text.has_value() || !value.has_value()) return msfs::json::error(id, "INVALID_REQUEST", "input.set requires --hash and numeric --value.");
        std::uint64_t hash = 0; const auto [end, code] = std::from_chars(hash_text->data(), hash_text->data() + hash_text->size(), hash);
        if (code != std::errc{} || end != hash_text->data() + hash_text->size()) return msfs::json::error(id, "INVALID_REQUEST", "--hash must be an unsigned 64-bit integer.");
        const auto result = simconnect.set_input_event(hash, *value); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"hash", msfs::json::quote(*hash_text)}, {"value", std::to_string(*value)}, {"set", "true"}}));
    }
    if (*command == "facilities.nearest") {
        bool valid = true; const std::string type = require_field(request, "type", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "facilities nearest requires --type airport|waypoint|ndb|vor.");
        const auto radius = msfs::json::string_at(request, "radius-nm").value_or("").empty() ? std::optional<double>(0.0) : number_field(request, "radius-nm");
        if (!radius.has_value() || *radius < 0) return msfs::json::error(id, "INVALID_REQUEST", "--radius-nm must be a non-negative number.");
        const auto result = simconnect.list_facilities(type, *radius); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"type", msfs::json::quote(type)}, {"radius_nm", std::to_string(*radius)}, {"facilities", result.value_json}}));
    }
    if (*command == "flight.load") {
        bool valid = true; const std::string path = require_field(request, "path", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "flight.load requires --path.");
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "flight.load changes simulator state; repeat with --unsafe.");
        const auto result = simconnect.flight_load(path); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"path", msfs::json::quote(path)}, {"loaded", "true"}}));
    }
    if (*command == "ai.aircraft.create-parked") {
        bool valid = true; const std::string title = require_field(request, "title", valid); const std::string tail = require_field(request, "tail", valid); const std::string airport = require_field(request, "airport", valid);
        if (!valid) return msfs::json::error(id, "INVALID_REQUEST", "ai aircraft create-parked requires --title, --tail and --airport.");
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "ai.aircraft.create-parked changes simulator state; repeat with --unsafe.");
        const auto result = simconnect.ai_create_parked(title, tail, airport); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"object_id", result.value_json}, {"created", "true"}}));
    }
    if (*command == "camera.acquire") {
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "camera.acquire changes simulator control; repeat with --unsafe.");
        const std::string client_id = msfs::json::string_at(request, "client-id").value_or("msfs-cli"); const auto result = simconnect.camera_acquire(client_id); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"client_id", msfs::json::quote(client_id)}, {"acquired", "true"}}));
    }
    if (*command == "camera.release") {
        if (!unsafe_allowed(request)) return msfs::json::error(id, "UNSAFE_REQUIRED", "camera.release changes simulator control; repeat with --unsafe.");
        const std::string definition = msfs::json::string_at(request, "definition").value_or(""); const auto result = simconnect.camera_release(definition); if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"released", "true"}}));
    }
    if (*command == "camera.status") {
        const auto result = simconnect.camera_status(); if (!result.ok) return result_error(id, result); return msfs::json::ok(id, result.value_json);
    }
    if (*command == "route.get") {
        const std::string source = msfs::json::string_at(request, "source").value_or("efb");
        if (source != "efb") return msfs::json::error(id, "INVALID_REQUEST", "route.get currently supports only --source efb.");
        const auto result = simconnect.get_efb_route(id);
        if (!result.ok) return result_error(id, result);
        return msfs::json::ok(id, msfs::json::object({{"source", msfs::json::quote("efb")}, {"route", result.value_json}}));
    }
    if (*command == "route.status") {
        return msfs::json::ok(id, msfs::json::object({{"transport", msfs::json::quote("SimConnect CommBus")}, {"request_event", msfs::json::quote("msfs.route.request")}, {"response_event", msfs::json::quote("msfs.route.response")}, {"installed", msfs::json::quote("unknown")}}));
    }

    return msfs::json::error(id, "NOT_IMPLEMENTED", "The requested native command is not implemented in this milestone.");
}

}  // namespace

int wmain() {
    HANDLE singleton = CreateMutexW(nullptr, TRUE, L"Local\\msfs-native-cli-daemon-v1");
    if (singleton == nullptr) {
        std::cerr << "CreateMutexW failed with Win32 error " << GetLastError() << std::endl;
        return 1;
    }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(singleton);
        return 0;
    }

    msfs::simconnect::SimConnectClient simconnect;
    std::cerr << "msfsd starting named-pipe server" << std::endl;
    std::atomic_bool stop_requested = false;
    const auto handler = [&simconnect, &stop_requested](const std::string& request) {
        return handle_request(request, simconnect, stop_requested);
    };
    while (!stop_requested.load()) {
        std::string pipe_error;
        if (!msfs::pipe::serve_once(handler, pipe_error) && !stop_requested.load() && !pipe_error.empty()) {
            std::cerr << pipe_error << std::endl;
        }
    }
    CloseHandle(singleton);
    return 0;
}
