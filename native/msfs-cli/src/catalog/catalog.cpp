#include "catalog/catalog.h"

#include "common/json.h"

#include <algorithm>
#include <array>
#include <cctype>
#include <string_view>
#include <vector>

namespace msfs::catalog {
namespace {

struct SimVar final {
    std::string_view name;
    std::string_view units;
    bool settable;
    bool indexed;
    std::string_view description;
};

struct KeyEvent final {
    std::string_view name;
    std::string_view description;
};

constexpr std::array<SimVar, 9> kSimVars{{
    {"PLANE ALTITUDE", "feet", false, false, "Aircraft altitude above sea level."},
    {"GROUND ALTITUDE", "feet", false, false, "Ground elevation directly below the aircraft."},
    {"PLANE LATITUDE", "degrees", false, false, "Aircraft latitude."},
    {"PLANE LONGITUDE", "degrees", false, false, "Aircraft longitude."},
    {"SIM ON GROUND", "bool", false, false, "Whether the user aircraft is on the ground."},
    {"AUTOPILOT ALTITUDE LOCK VAR", "feet", true, false, "Selected autopilot altitude."},
    {"AUTOPILOT HEADING LOCK DIR", "degrees", true, false, "Selected autopilot heading."},
    {"FUEL TOTAL QUANTITY", "gallons", false, false, "Total usable fuel quantity."},
    {"GPS WP NEXT ID", "string", false, false, "Identifier of the next GPS waypoint."},
}};

constexpr std::array<KeyEvent, 4> kKeyEvents{{
    {"AP_MASTER", "Toggle the autopilot master."},
    {"GEAR_TOGGLE", "Toggle landing gear."},
    {"FLAPS_INCR", "Increase flap setting."},
    {"FLAPS_DECR", "Decrease flap setting."},
}};

std::string lower(std::string_view value) {
    std::string result(value);
    std::transform(result.begin(), result.end(), result.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return result;
}

bool matches(std::string_view haystack, const std::string& query) {
    return query.empty() || lower(haystack).find(query) != std::string::npos;
}

std::string simvar_json(const SimVar& variable) {
    return json::object({
        {"name", json::quote(variable.name)},
        {"units", json::quote(variable.units)},
        {"settable", variable.settable ? "true" : "false"},
        {"indexed", variable.indexed ? "true" : "false"},
        {"description", json::quote(variable.description)},
    });
}

}  // namespace

std::string search_simvars_json(const std::string& query) {
    const std::string normalized = lower(query);
    std::vector<std::string> results;
    for (const auto& variable : kSimVars) {
        if (matches(variable.name, normalized) || matches(variable.description, normalized)) {
            results.push_back(simvar_json(variable));
        }
    }
    std::string body = "[";
    for (size_t index = 0; index < results.size(); ++index) {
        if (index != 0) body += ",";
        body += results[index];
    }
    body += "]";
    return json::object({
        {"kind", json::quote("simvar")},
        {"query", json::quote(query)},
        {"results", body},
        {"catalog", json::quote("seed; replace with generated SDK catalog")},
    });
}

std::string show_simvar_json(const std::string& name) {
    const std::string normalized = lower(name);
    for (const auto& variable : kSimVars) {
        if (lower(variable.name) == normalized) return simvar_json(variable);
    }
    return {};
}

std::string search_events_json(const std::string& query) {
    const std::string normalized = lower(query);
    std::vector<std::string> results;
    for (const auto& event : kKeyEvents) {
        if (matches(event.name, normalized) || matches(event.description, normalized)) {
            results.push_back(json::object({
                {"name", json::quote(event.name)},
                {"description", json::quote(event.description)},
            }));
        }
    }
    std::string body = "[";
    for (size_t index = 0; index < results.size(); ++index) {
        if (index != 0) body += ",";
        body += results[index];
    }
    body += "]";
    return json::object({
        {"kind", json::quote("key-event")},
        {"query", json::quote(query)},
        {"results", body},
        {"catalog", json::quote("seed; replace with generated SDK catalog")},
    });
}

}  // namespace msfs::catalog
