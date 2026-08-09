#include <MSFS/MSFS.h>
#include <MSFS/MSFS_CommBus.h>
#include <MSFS/MSFS_PlannedRoute.h>

#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#if defined(MSFS_ROUTE_BRIDGE_DIAGNOSTIC_SMOKE)

// This is intentionally a no-import standalone module. It isolates the MSFS
// module loader from CommBus and Planned Route API initialization when
// diagnosing a runtime "Failed" status.
extern "C" MSFS_CALLBACK void module_init() {}
extern "C" MSFS_CALLBACK void module_deinit() {}

#else

namespace {

constexpr const char* kRequestEvent = "msfs.route.request";
constexpr const char* kResponseEvent = "msfs.route.response";
constexpr unsigned int kResponseCapacity = 64 * 1024;
char g_response[kResponseCapacity]{};

void append(char*& cursor, unsigned int& remaining, const char* text) {
    if (remaining == 0) return;
    while (*text != '\0' && remaining > 1) {
        *cursor++ = *text++;
        --remaining;
    }
    if (*text != '\0') remaining = 0;
    else *cursor = '\0';
}

void append_char(char*& cursor, unsigned int& remaining, char value) {
    if (remaining <= 1) {
        remaining = 0;
        return;
    }
    *cursor++ = value;
    *cursor = '\0';
    --remaining;
}

void append_unsigned(char*& cursor, unsigned int& remaining, unsigned long long value) {
    char digits[32]{};
    unsigned int count = 0;
    do {
        digits[count++] = static_cast<char>('0' + (value % 10));
        value /= 10;
    } while (value != 0 && count < sizeof(digits));
    while (count != 0) append_char(cursor, remaining, digits[--count]);
}

void append_int(char*& cursor, unsigned int& remaining, int value) {
    if (value < 0) {
        append_char(cursor, remaining, '-');
        append_unsigned(cursor, remaining, static_cast<unsigned long long>(-(static_cast<long long>(value))));
        return;
    }
    append_unsigned(cursor, remaining, static_cast<unsigned long long>(value));
}

void append_fixed_8(char*& cursor, unsigned int& remaining, double value) {
    constexpr unsigned long long kScale = 100000000ULL;
    if (value < 0.0) {
        append_char(cursor, remaining, '-');
        value = -value;
    }
    auto integer = static_cast<unsigned long long>(value);
    auto fraction = static_cast<unsigned long long>((value - static_cast<double>(integer)) * static_cast<double>(kScale) + 0.5);
    if (fraction >= kScale) {
        ++integer;
        fraction -= kScale;
    }
    append_unsigned(cursor, remaining, integer);
    append_char(cursor, remaining, '.');
    unsigned long long divisor = kScale / 10;
    while (divisor != 0) {
        append_char(cursor, remaining, static_cast<char>('0' + (fraction / divisor) % 10));
        divisor /= 10;
    }
}

void append_json_string(char*& cursor, unsigned int& remaining, const char* value) {
    append(cursor, remaining, "\"");
    for (const char* current = value == nullptr ? "" : value; *current != '\0' && remaining > 3; ++current) {
        if (*current == '\\' || *current == '\"') {
            append(cursor, remaining, "\\");
            append_char(cursor, remaining, *current);
        }
        else if (static_cast<unsigned char>(*current) < 0x20) append(cursor, remaining, " ");
        else append_char(cursor, remaining, *current);
    }
    append(cursor, remaining, "\"");
}

bool request_id_from(const char* buffer, unsigned int size, char (&output)[128]) {
    const char* begin = strstr(buffer, "\"requestId\"");
    if (begin == nullptr || begin >= buffer + size) return false;
    begin = strchr(begin + 11, '\"');
    if (begin == nullptr || begin >= buffer + size) return false;
    ++begin;
    const char* end = strchr(begin, '\"');
    if (end == nullptr || end >= buffer + size || end == begin || end - begin >= static_cast<ptrdiff_t>(sizeof(output))) return false;
    memcpy(output, begin, static_cast<size_t>(end - begin));
    output[end - begin] = '\0';
    return true;
}

void respond_error(const char* request_id, const char* message) {
    char response[512]{};
    char* cursor = response;
    unsigned int remaining = sizeof(response);
    append(cursor, remaining, "{\"requestId\":"); append_json_string(cursor, remaining, request_id);
    append(cursor, remaining, ",\"ok\":false,\"message\":"); append_json_string(cursor, remaining, message); append(cursor, remaining, "}");
    fsCommBusCall(kResponseEvent, response, static_cast<unsigned int>(strlen(response)), FsCommBusBroadcast_SimConnect);
}

void append_icao(char*& cursor, unsigned int& remaining, const FsRouteIcao& value) {
    append_json_string(cursor, remaining, value.ident);
}

void append_route(char*& cursor, unsigned int& remaining, const FsPlannedRoute& route) {
    append(cursor, remaining, "{\"departure\":{\"icao\":"); append_icao(cursor, remaining, route.departureAirport);
    append(cursor, remaining, ",\"runway_number\":"); append_int(cursor, remaining, route.departureRunway.number); append(cursor, remaining, ",\"runway_designator\":"); append_int(cursor, remaining, route.departureRunway.designator); append(cursor, remaining, ",\"sid\":"); append_json_string(cursor, remaining, route.departure);
    append(cursor, remaining, ",\"transition\":"); append_json_string(cursor, remaining, route.departureTransition); append(cursor, remaining, "}");
    append(cursor, remaining, ",\"destination\":{\"icao\":"); append_icao(cursor, remaining, route.destinationAirport);
    append(cursor, remaining, ",\"runway_number\":"); append_int(cursor, remaining, route.destinationRunway.number); append(cursor, remaining, ",\"runway_designator\":"); append_int(cursor, remaining, route.destinationRunway.designator); append(cursor, remaining, ",\"star\":"); append_json_string(cursor, remaining, route.arrival);
    append(cursor, remaining, ",\"transition\":"); append_json_string(cursor, remaining, route.arrivalTransition); append(cursor, remaining, "}");
    append(cursor, remaining, ",\"approach\":{\"type\":"); append_int(cursor, remaining, route.approach.type); append(cursor, remaining, ",\"suffix\":"); append_json_string(cursor, remaining, route.approach.suffix); append(cursor, remaining, "}");
    append(cursor, remaining, ",\"cruise_altitude\":{\"type\":"); append_int(cursor, remaining, route.cruiseAltitude.type); append(cursor, remaining, ",\"value\":"); append_int(cursor, remaining, route.cruiseAltitude.altitude); append(cursor, remaining, "},\"is_vfr\":"); append(cursor, remaining, route.isVfr ? "true" : "false"); append(cursor, remaining, ",\"enroute_legs\":[");
    for (int index = 0; index < route.numEnrouteLegs; ++index) {
        if (index != 0) append(cursor, remaining, ",");
        const FsEnrouteLeg& leg = route.enrouteLegs[index];
        append(cursor, remaining, "{\"type\":"); append_int(cursor, remaining, leg.type); append(cursor, remaining, ",\"icao\":"); append_icao(cursor, remaining, leg.fixIcao);
        append(cursor, remaining, ",\"name\":"); append_json_string(cursor, remaining, leg.name);
        append(cursor, remaining, ",\"via\":"); append_json_string(cursor, remaining, leg.via);
        append(cursor, remaining, ",\"latitude\":"); append_fixed_8(cursor, remaining, leg.lat); append(cursor, remaining, ",\"longitude\":"); append_fixed_8(cursor, remaining, leg.lon); append(cursor, remaining, "}");
    }
    append(cursor, remaining, "]}");
}

void free_route(FsPlannedRoute* route) {
    if (route == nullptr) return;
    for (int index = 0; index < route->numEnrouteLegs; ++index) free(route->enrouteLegs[index].name);
    free(route->enrouteLegs);
    free(route);
}

void route_request(const char* buffer, unsigned int size, void*) {
    char request_id[128]{};
    if (buffer == nullptr || !request_id_from(buffer, size, request_id)) return;
    FsPlannedRoute* route = fsPlannedRouteGetEfbRoute();
    if (route == nullptr) { respond_error(request_id, "No EFB flight plan is currently available."); return; }
    memset(g_response, 0, sizeof(g_response));
    char* cursor = g_response;
    unsigned int remaining = sizeof(g_response);
    append(cursor, remaining, "{\"requestId\":"); append_json_string(cursor, remaining, request_id); append(cursor, remaining, ",\"ok\":true,\"route\":");
    append_route(cursor, remaining, *route); append(cursor, remaining, "}");
    free_route(route);
    if (remaining == 0) { respond_error(request_id, "The EFB route is too large for the current bridge response buffer."); return; }
    fsCommBusCall(kResponseEvent, g_response, static_cast<unsigned int>(strlen(g_response)), FsCommBusBroadcast_SimConnect);
}

}  // namespace

// The SDK's WASI libc is built with stack protection but does not provide the
// failure handler. Keep it inside the module instead of leaving an unresolved
// env import that prevents MSFS from loading the WASM binary.
extern "C" [[noreturn]] void __stack_chk_fail() {
    __builtin_trap();
}

extern "C" MSFS_CALLBACK void module_init() { fsCommBusRegister(kRequestEvent, route_request, nullptr); }
extern "C" MSFS_CALLBACK void module_deinit() { fsCommBusUnregisterOneEvent(kRequestEvent, route_request, nullptr); }

#endif
