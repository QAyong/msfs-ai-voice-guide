#include "simconnect/simconnect_client.h"

#include "common/json.h"

#if defined(MSFS_CLI_HAS_SIMCONNECT)
#include <windows.h>
#include <SimConnect.h>

#include <algorithm>
#include <chrono>
#include <cstddef>
#include <cmath>
#include <cstdlib>
#include <optional>
#include <thread>
#include <vector>
#endif

namespace msfs::simconnect {

#if defined(MSFS_CLI_HAS_SIMCONNECT)
namespace {

struct SimConnectRuntime final {
    using OpenFn = decltype(&SimConnect_Open);
    using AddDefinitionFn = decltype(&SimConnect_AddToDataDefinition);
    using ClearDefinitionFn = decltype(&SimConnect_ClearDataDefinition);
    using RequestDataFn = decltype(&SimConnect_RequestDataOnSimObject);
    using SetDataFn = decltype(&SimConnect_SetDataOnSimObject);
    using DispatchFn = decltype(&SimConnect_CallDispatch);
    using CloseFn = decltype(&SimConnect_Close);
    using MapEventFn = decltype(&SimConnect_MapClientEventToSimEvent);
    using TransmitEventEx1Fn = decltype(&SimConnect_TransmitClientEvent_EX1);
    using RequestSystemStateFn = decltype(&SimConnect_RequestSystemState);
    using EnumerateInputEventsFn = decltype(&SimConnect_EnumerateInputEvents);
    using SetInputEventFn = decltype(&SimConnect_SetInputEvent);
    using RequestFacilitiesListFn = decltype(&SimConnect_RequestFacilitiesList);
    using FlightLoadFn = decltype(&SimConnect_FlightLoad);
    using AICreateParkedFn = decltype(&SimConnect_AICreateParkedATCAircraft);
    using CameraAcquireFn = decltype(&SimConnect_CameraAcquire);
    using CameraReleaseFn = decltype(&SimConnect_CameraRelease);
    using CameraGetStatusFn = decltype(&SimConnect_CameraGetStatus);
    using SubscribeCommBusFn = decltype(&SimConnect_SubscribeToCommBusEvent);
    using UnsubscribeCommBusFn = decltype(&SimConnect_UnsubscribeToCommBusEvent);
    using CallCommBusFn = decltype(&SimConnect_CallCommBusEvent);
    using GetLastSentPacketIdFn = decltype(&SimConnect_GetLastSentPacketID);

    bool ensure_loaded() {
        if (attempted) return module != nullptr;
        attempted = true;
        module = LoadLibraryW(L"SimConnect.dll");
        if (module == nullptr) {
            error = "SimConnect.dll was not found. Install the MSFS SimConnect runtime or place it beside msfsd.exe.";
            return false;
        }
        open = load<OpenFn>("SimConnect_Open");
        add_definition = load<AddDefinitionFn>("SimConnect_AddToDataDefinition");
        clear_definition = load<ClearDefinitionFn>("SimConnect_ClearDataDefinition");
        request_data = load<RequestDataFn>("SimConnect_RequestDataOnSimObject");
        set_data = load<SetDataFn>("SimConnect_SetDataOnSimObject");
        call_dispatch = load<DispatchFn>("SimConnect_CallDispatch");
        close = load<CloseFn>("SimConnect_Close");
        map_event = load<MapEventFn>("SimConnect_MapClientEventToSimEvent");
        transmit_event_ex1 = load<TransmitEventEx1Fn>("SimConnect_TransmitClientEvent_EX1");
        request_system_state = load<RequestSystemStateFn>("SimConnect_RequestSystemState");
        enumerate_input_events = load<EnumerateInputEventsFn>("SimConnect_EnumerateInputEvents");
        set_input_event = load<SetInputEventFn>("SimConnect_SetInputEvent");
        request_facilities_list = load<RequestFacilitiesListFn>("SimConnect_RequestFacilitiesList");
        flight_load = load<FlightLoadFn>("SimConnect_FlightLoad");
        ai_create_parked = load<AICreateParkedFn>("SimConnect_AICreateParkedATCAircraft");
        camera_acquire = load<CameraAcquireFn>("SimConnect_CameraAcquire");
        camera_release = load<CameraReleaseFn>("SimConnect_CameraRelease");
        camera_get_status = load<CameraGetStatusFn>("SimConnect_CameraGetStatus");
        subscribe_commbus = load<SubscribeCommBusFn>("SimConnect_SubscribeToCommBusEvent");
        unsubscribe_commbus = load<UnsubscribeCommBusFn>("SimConnect_UnsubscribeToCommBusEvent");
        call_commbus = load<CallCommBusFn>("SimConnect_CallCommBusEvent");
        get_last_sent_packet_id = load<GetLastSentPacketIdFn>("SimConnect_GetLastSentPacketID");
        if (open && add_definition && clear_definition && request_data && set_data && call_dispatch && close &&
            map_event && transmit_event_ex1 && request_system_state && enumerate_input_events && set_input_event &&
            request_facilities_list && flight_load && ai_create_parked && camera_acquire && camera_release && camera_get_status &&
            subscribe_commbus && unsubscribe_commbus && call_commbus && get_last_sent_packet_id) {
            return true;
        }
        error = "SimConnect.dll does not expose the API surface required by this MSFS CLI build.";
        FreeLibrary(module);
        module = nullptr;
        return false;
    }

    template <typename T>
    T load(const char* name) const { return reinterpret_cast<T>(GetProcAddress(module, name)); }

    HMODULE module = nullptr;
    bool attempted = false;
    std::string error;
    OpenFn open = nullptr;
    AddDefinitionFn add_definition = nullptr;
    ClearDefinitionFn clear_definition = nullptr;
    RequestDataFn request_data = nullptr;
    SetDataFn set_data = nullptr;
    DispatchFn call_dispatch = nullptr;
    CloseFn close = nullptr;
    MapEventFn map_event = nullptr;
    TransmitEventEx1Fn transmit_event_ex1 = nullptr;
    RequestSystemStateFn request_system_state = nullptr;
    EnumerateInputEventsFn enumerate_input_events = nullptr;
    SetInputEventFn set_input_event = nullptr;
    RequestFacilitiesListFn request_facilities_list = nullptr;
    FlightLoadFn flight_load = nullptr;
    AICreateParkedFn ai_create_parked = nullptr;
    CameraAcquireFn camera_acquire = nullptr;
    CameraReleaseFn camera_release = nullptr;
    CameraGetStatusFn camera_get_status = nullptr;
    SubscribeCommBusFn subscribe_commbus = nullptr;
    UnsubscribeCommBusFn unsubscribe_commbus = nullptr;
    CallCommBusFn call_commbus = nullptr;
    GetLastSentPacketIdFn get_last_sent_packet_id = nullptr;
};

SimConnectRuntime& runtime() { static SimConnectRuntime instance; return instance; }

struct ConnectionProbe final { bool quit = false; };
void CALLBACK connection_probe_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<ConnectionProbe*>(context);
    if (data->dwID == SIMCONNECT_RECV_ID_QUIT) state.quit = true;
}

template <typename State>
bool wait_for(SimConnectRuntime& api, HANDLE handle, State& state, DispatchProc callback) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    while (!state.complete && std::chrono::steady_clock::now() < deadline) {
        api.call_dispatch(handle, callback, &state);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    return state.complete;
}

bool matches_send_id(DWORD actual, DWORD definition_send_id, DWORD request_send_id) {
    return actual != 0 && (actual == definition_send_id || actual == request_send_id);
}

std::string exception_message(const SIMCONNECT_RECV_EXCEPTION& response) {
    return "SimConnect exception " + std::to_string(response.dwException) +
           " at parameter index " + std::to_string(response.dwIndex) + ".";
}

struct FloatRead final {
    DWORD request_id;
    DWORD definition_send_id;
    DWORD request_send_id;
    bool complete = false;
    std::optional<double> value;
    std::string error;
};
void CALLBACK float_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<FloatRead*>(context);
    if (data->dwID == SIMCONNECT_RECV_ID_SIMOBJECT_DATA) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(data);
        if (response->dwRequestID != state.request_id) return;
        state.value = *reinterpret_cast<const double*>(&response->dwData);
        state.complete = true;
    } else if (data->dwID == SIMCONNECT_RECV_ID_EXCEPTION) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_EXCEPTION*>(data);
        if (matches_send_id(response->dwSendID, state.definition_send_id, state.request_send_id)) {
            state.error = exception_message(*response);
            state.complete = true;
        }
    }
}

struct StringRead final {
    DWORD request_id;
    DWORD definition_send_id;
    DWORD request_send_id;
    bool complete = false;
    std::string value;
    std::string error;
};
void CALLBACK string_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<StringRead*>(context);
    if (data->dwID == SIMCONNECT_RECV_ID_SIMOBJECT_DATA) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(data);
        if (response->dwRequestID != state.request_id) return;
        const char* value = reinterpret_cast<const char*>(&response->dwData);
        const size_t payload_offset = offsetof(SIMCONNECT_RECV_SIMOBJECT_DATA, dwData);
        const size_t payload_size = response->dwSize > payload_offset ? response->dwSize - payload_offset : 0;
        const size_t bounded_size = std::min<size_t>(payload_size, 256);
        state.value.assign(value, std::find(value, value + bounded_size, '\0'));
        state.complete = true;
    } else if (data->dwID == SIMCONNECT_RECV_ID_EXCEPTION) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_EXCEPTION*>(data);
        if (matches_send_id(response->dwSendID, state.definition_send_id, state.request_send_id)) {
            state.error = exception_message(*response);
            state.complete = true;
        }
    }
}

struct SystemRead final { DWORD request_id; bool complete = false; DWORD integer = 0; float floating = 0; std::string text; std::string error; };
void CALLBACK system_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<SystemRead*>(context);
    if (data->dwID == SIMCONNECT_RECV_ID_SYSTEM_STATE) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_SYSTEM_STATE*>(data);
        if (response->dwRequestID != state.request_id) return;
        state.integer = response->dwInteger; state.floating = response->fFloat; state.text = response->szString; state.complete = true;
    }
}

struct InputList final { DWORD request_id; bool complete = false; std::vector<std::string> values; };
void CALLBACK input_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<InputList*>(context);
    if (data->dwID != SIMCONNECT_RECV_ID_ENUMERATE_INPUT_EVENTS) return;
    const auto* response = reinterpret_cast<SIMCONNECT_RECV_ENUMERATE_INPUT_EVENTS*>(data);
    if (response->dwRequestID != state.request_id) return;
    for (DWORD i = 0; i < response->dwArraySize; ++i) {
        const auto& event = response->rgData[i];
        state.values.push_back(json::object({{"name", json::quote(event.Name)}, {"hash", json::quote(std::to_string(event.Hash))}, {"type", std::to_string(event.eType)}}));
    }
    if (response->dwEntryNumber + 1 >= response->dwOutOf) state.complete = true;
}

struct FacilityList final { DWORD request_id; bool complete = false; double latitude = 0; double longitude = 0; double radius_nm = 0; std::vector<std::string> values; };
double distance_nm(double first_lat, double first_lon, double second_lat, double second_lon) {
    constexpr double pi = 3.14159265358979323846;
    constexpr double earth_radius_nm = 3440.065;
    const double lat1 = first_lat * pi / 180.0, lat2 = second_lat * pi / 180.0;
    const double delta_lat = (second_lat - first_lat) * pi / 180.0, delta_lon = (second_lon - first_lon) * pi / 180.0;
    const double a = std::sin(delta_lat / 2) * std::sin(delta_lat / 2) + std::cos(lat1) * std::cos(lat2) * std::sin(delta_lon / 2) * std::sin(delta_lon / 2);
    return earth_radius_nm * 2 * std::atan2(std::sqrt(a), std::sqrt(1 - a));
}
std::string facility_json(const SIMCONNECT_DATA_FACILITY_AIRPORT& item, const char* kind, double distance) {
    return json::object({{"type", json::quote(kind)}, {"icao", json::quote(item.Ident)}, {"region", json::quote(item.Region)},
                         {"latitude", std::to_string(item.Latitude)}, {"longitude", std::to_string(item.Longitude)}, {"altitude_m", std::to_string(item.Altitude)}, {"distance_nm", std::to_string(distance)}});
}
void CALLBACK facility_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<FacilityList*>(context);
    const auto finish = [&state](const SIMCONNECT_RECV_FACILITIES_LIST* response) { if (response->dwEntryNumber + 1 >= response->dwOutOf) state.complete = true; };
    const auto add = [&state](const SIMCONNECT_DATA_FACILITY_AIRPORT& item, const char* kind) {
        const double distance = distance_nm(state.latitude, state.longitude, item.Latitude, item.Longitude);
        if (state.radius_nm <= 0 || distance <= state.radius_nm) state.values.push_back(facility_json(item, kind, distance));
    };
    if (data->dwID == SIMCONNECT_RECV_ID_AIRPORT_LIST) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_AIRPORT_LIST*>(data); if (response->dwRequestID != state.request_id) return;
        for (DWORD i = 0; i < response->dwArraySize; ++i) add(response->rgData[i], "airport"); finish(response);
    } else if (data->dwID == SIMCONNECT_RECV_ID_WAYPOINT_LIST) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_WAYPOINT_LIST*>(data); if (response->dwRequestID != state.request_id) return;
        for (DWORD i = 0; i < response->dwArraySize; ++i) add(response->rgData[i], "waypoint"); finish(response);
    } else if (data->dwID == SIMCONNECT_RECV_ID_NDB_LIST) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_NDB_LIST*>(data); if (response->dwRequestID != state.request_id) return;
        for (DWORD i = 0; i < response->dwArraySize; ++i) add(response->rgData[i], "ndb"); finish(response);
    } else if (data->dwID == SIMCONNECT_RECV_ID_VOR_LIST) {
        const auto* response = reinterpret_cast<SIMCONNECT_RECV_VOR_LIST*>(data); if (response->dwRequestID != state.request_id) return;
        for (DWORD i = 0; i < response->dwArraySize; ++i) add(response->rgData[i], "vor"); finish(response);
    }
}

struct ObjectId final { DWORD request_id; bool complete = false; DWORD object_id = 0; };
void CALLBACK assigned_object_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<ObjectId*>(context);
    if (data->dwID != SIMCONNECT_RECV_ID_ASSIGNED_OBJECT_ID) return;
    const auto* response = reinterpret_cast<SIMCONNECT_RECV_ASSIGNED_OBJECT_ID*>(data);
    if (response->dwRequestID == state.request_id) { state.object_id = response->dwObjectID; state.complete = true; }
}

struct CameraStatus final { bool complete = false; DWORD state = 0; bool game_controlled = false; };
void CALLBACK camera_status_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<CameraStatus*>(context);
    if (data->dwID != SIMCONNECT_RECV_ID_CAMERA_STATUS) return;
    const auto* response = reinterpret_cast<SIMCONNECT_RECV_CAMERA_STATUS*>(data);
    state.state = response->acquiredState; state.game_controlled = response->bGameControlled != FALSE; state.complete = true;
}

struct CommBusRoute final { DWORD event_id; std::string correlation_id; bool complete = false; std::string route_json; std::string error; };
void CALLBACK commbus_route_dispatch(SIMCONNECT_RECV* data, DWORD, void* context) {
    auto& state = *static_cast<CommBusRoute*>(context);
    if (data->dwID != SIMCONNECT_RECV_ID_COMM_BUS) return;
    const auto* response = reinterpret_cast<SIMCONNECT_RECV_COMM_BUS*>(data);
    if (response->uEventID != state.event_id) return;
    const std::string payload(response->rgData);
    const auto correlation = json::string_at(payload, "requestId");
    if (!correlation.has_value() || *correlation != state.correlation_id) return;
    if (payload.find("\"ok\":false") != std::string::npos) {
        state.error = json::string_at(payload, "message").value_or("The EFB route bridge returned an error.");
    } else {
        const size_t route = payload.find("\"route\"");
        const size_t colon = route == std::string::npos ? std::string::npos : payload.find(':', route);
        if (colon == std::string::npos) state.error = "The EFB route bridge returned no route payload.";
        else state.route_json = payload.substr(colon + 1, payload.size() - colon - 2);
    }
    state.complete = true;
}

std::string array_json(const std::vector<std::string>& values) {
    std::string result = "[";
    for (size_t i = 0; i < values.size(); ++i) { if (i) result += ','; result += values[i]; }
    return result + "]";
}

}  // namespace
#endif

SimConnectClient::SimConnectClient() = default;
SimConnectClient::~SimConnectClient() {
    close_connection();
}

bool SimConnectClient::sdk_compiled() const {
#if defined(MSFS_CLI_HAS_SIMCONNECT)
    return true;
#else
    return false;
#endif
}
bool SimConnectClient::connected() const { return connected_; }
std::string SimConnectClient::status_json() {
    refresh_connection_state();
    return json::object({{"sdk_compiled", sdk_compiled() ? "true" : "false"}, {"connected", connected_ ? "true" : "false"}, {"transport", json::quote("SimConnect")}});
}

void SimConnectClient::close_connection() {
#if defined(MSFS_CLI_HAS_SIMCONNECT)
    if (handle_ != nullptr) {
        auto& api = runtime();
        if (api.ensure_loaded()) api.close(static_cast<HANDLE>(handle_));
        handle_ = nullptr;
    }
#endif
    connected_ = false;
}

void SimConnectClient::refresh_connection_state() {
#if defined(MSFS_CLI_HAS_SIMCONNECT)
    if (handle_ == nullptr) return;
    auto& api = runtime();
    if (!api.ensure_loaded()) {
        close_connection();
        return;
    }
    ConnectionProbe probe{};
    const HRESULT dispatched = api.call_dispatch(static_cast<HANDLE>(handle_), connection_probe_dispatch, &probe);
    if (FAILED(dispatched) || probe.quit) close_connection();
#endif
}

Result SimConnectClient::ensure_open() {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return {false, {}, "SDK_NOT_CONFIGURED", "MSFS2024_SDK_ROOT is not configured; rebuild with the MSFS 2024 SimConnect SDK."};
#else
    auto& api = runtime();
    if (!api.ensure_loaded()) return {false, {}, "SIMCONNECT_RUNTIME_UNAVAILABLE", api.error};
    refresh_connection_state();
    if (handle_ != nullptr) return {true, "true", {}, {}};
    HANDLE opened = nullptr;
    if (FAILED(api.open(&opened, "msfsd", nullptr, 0, nullptr, 0))) return {false, {}, "SIM_NOT_READY", "Unable to open a SimConnect session. Start MSFS and load a flight."};
    handle_ = opened; connected_ = true;
    return {true, "true", {}, {}};
#endif
}

Result SimConnectClient::get_float64(const std::string& variable, const std::string& unit) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime();
    const DWORD definition = next_id_++, request = next_id_++;
    if (FAILED(api.add_definition(static_cast<HANDLE>(handle_), definition, variable.c_str(), unit.c_str(), SIMCONNECT_DATATYPE_FLOAT64, 0.0f, SIMCONNECT_UNUSED))) return {false, {}, "SIMCONNECT_DEFINITION_FAILED", "Could not define the requested SimVar."};
    DWORD definition_send_id = 0;
    api.get_last_sent_packet_id(static_cast<HANDLE>(handle_), &definition_send_id);
    const HRESULT requested = api.request_data(static_cast<HANDLE>(handle_), request, definition, SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD_ONCE, 0, 0, 0, 0);
    if (FAILED(requested)) { api.clear_definition(static_cast<HANDLE>(handle_), definition); return {false, {}, "SIMCONNECT_REQUEST_FAILED", "Could not request the SimVar from the user aircraft."}; }
    DWORD request_send_id = 0;
    api.get_last_sent_packet_id(static_cast<HANDLE>(handle_), &request_send_id);
    FloatRead state{request, definition_send_id, request_send_id}; wait_for(api, static_cast<HANDLE>(handle_), state, float_dispatch); api.clear_definition(static_cast<HANDLE>(handle_), definition);
    if (!state.error.empty()) return {false, {}, "SIMCONNECT_EXCEPTION", state.error};
    if (!state.value.has_value()) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for the SimConnect data response."};
    return {true, std::to_string(*state.value), {}, {}};
#endif
}

Result SimConnectClient::get_string(const std::string& variable, const std::string& unit) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD definition = next_id_++, request = next_id_++;
    (void)unit;  // String/structure SimVars require a null UnitsName in SimConnect.
    if (FAILED(api.add_definition(static_cast<HANDLE>(handle_), definition, variable.c_str(), nullptr, SIMCONNECT_DATATYPE_STRING256, 0.0f, SIMCONNECT_UNUSED))) return {false, {}, "SIMCONNECT_DEFINITION_FAILED", "Could not define the requested string SimVar."};
    DWORD definition_send_id = 0;
    api.get_last_sent_packet_id(static_cast<HANDLE>(handle_), &definition_send_id);
    if (FAILED(api.request_data(static_cast<HANDLE>(handle_), request, definition, SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD_ONCE, 0, 0, 0, 0))) { api.clear_definition(static_cast<HANDLE>(handle_), definition); return {false, {}, "SIMCONNECT_REQUEST_FAILED", "Could not request the string SimVar."}; }
    DWORD request_send_id = 0;
    api.get_last_sent_packet_id(static_cast<HANDLE>(handle_), &request_send_id);
    StringRead state{request, definition_send_id, request_send_id}; wait_for(api, static_cast<HANDLE>(handle_), state, string_dispatch); api.clear_definition(static_cast<HANDLE>(handle_), definition);
    if (!state.error.empty()) return {false, {}, "SIMCONNECT_EXCEPTION", state.error}; if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for the SimConnect data response."};
    return {true, json::quote(state.value), {}, {}};
#endif
}

Result SimConnectClient::set_float64(const std::string& variable, const std::string& unit, double value) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD definition = next_id_++;
    if (FAILED(api.add_definition(static_cast<HANDLE>(handle_), definition, variable.c_str(), unit.c_str(), SIMCONNECT_DATATYPE_FLOAT64, 0.0f, SIMCONNECT_UNUSED))) return {false, {}, "SIMCONNECT_DEFINITION_FAILED", "Could not define the writable SimVar."};
    const HRESULT set = api.set_data(static_cast<HANDLE>(handle_), definition, SIMCONNECT_OBJECT_ID_USER, 0, 0, sizeof(value), &value); api.clear_definition(static_cast<HANDLE>(handle_), definition);
    if (FAILED(set)) return {false, {}, "SIMCONNECT_SET_FAILED", "SimConnect rejected the SimVar write."}; return {true, "true", {}, {}};
#endif
}

Result SimConnectClient::get_system_state(const std::string& state_name) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD request = next_id_++;
    if (FAILED(api.request_system_state(static_cast<HANDLE>(handle_), request, state_name.c_str()))) return {false, {}, "SIMCONNECT_SYSTEM_STATE_FAILED", "SimConnect rejected the system-state request."};
    SystemRead state{request}; wait_for(api, static_cast<HANDLE>(handle_), state, system_dispatch); if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for the system-state response."};
    return {true, json::object({{"integer", std::to_string(state.integer)}, {"float", std::to_string(state.floating)}, {"string", json::quote(state.text)}}), {}, {}};
#endif
}

Result SimConnectClient::send_key_event(const std::string& event_name, std::array<std::uint32_t, 5> data) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD event_id = next_id_++;
    if (FAILED(api.map_event(static_cast<HANDLE>(handle_), event_id, event_name.c_str()))) return {false, {}, "SIMCONNECT_EVENT_MAP_FAILED", "Could not map the requested Key Event."};
    if (FAILED(api.transmit_event_ex1(static_cast<HANDLE>(handle_), SIMCONNECT_OBJECT_ID_USER, event_id, 0, SIMCONNECT_EVENT_FLAG_DEFAULT, data[0], data[1], data[2], data[3], data[4]))) return {false, {}, "SIMCONNECT_EVENT_SEND_FAILED", "Could not send the requested Key Event."};
    return {true, "true", {}, {}};
#endif
}

Result SimConnectClient::list_input_events() {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD request = next_id_++;
    if (FAILED(api.enumerate_input_events(static_cast<HANDLE>(handle_), request))) return {false, {}, "SIMCONNECT_INPUT_ENUM_FAILED", "SimConnect rejected the input-event enumeration."};
    InputList state{request}; wait_for(api, static_cast<HANDLE>(handle_), state, input_dispatch); if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out enumerating input events."}; return {true, array_json(state.values), {}, {}};
#endif
}

Result SimConnectClient::set_input_event(std::uint64_t hash, double value) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime();
    if (FAILED(api.set_input_event(static_cast<HANDLE>(handle_), hash, sizeof(value), &value))) return {false, {}, "SIMCONNECT_INPUT_SET_FAILED", "SimConnect rejected the input-event write."}; return {true, "true", {}, {}};
#endif
}

Result SimConnectClient::list_facilities(const std::string& type, double radius_nm) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    SIMCONNECT_FACILITY_LIST_TYPE kind{};
    if (type == "airport") kind = SIMCONNECT_FACILITY_LIST_TYPE_AIRPORT;
    else if (type == "waypoint") kind = SIMCONNECT_FACILITY_LIST_TYPE_WAYPOINT;
    else if (type == "ndb") kind = SIMCONNECT_FACILITY_LIST_TYPE_NDB;
    else if (type == "vor") kind = SIMCONNECT_FACILITY_LIST_TYPE_VOR;
    else return {false, {}, "USAGE", "--type must be airport, waypoint, ndb, or vor."};
    const auto ready = ensure_open(); if (!ready.ok) return ready;
    const auto latitude = get_float64("PLANE LATITUDE", "degrees"); if (!latitude.ok) return latitude;
    const auto longitude = get_float64("PLANE LONGITUDE", "degrees"); if (!longitude.ok) return longitude;
    const double lat = std::strtod(latitude.value_json.c_str(), nullptr), lon = std::strtod(longitude.value_json.c_str(), nullptr);
    auto& api = runtime(); const DWORD request = next_id_++;
    if (FAILED(api.request_facilities_list(static_cast<HANDLE>(handle_), kind, request))) return {false, {}, "SIMCONNECT_FACILITIES_FAILED", "SimConnect rejected the facilities request."};
    FacilityList state{request, false, lat, lon, radius_nm}; wait_for(api, static_cast<HANDLE>(handle_), state, facility_dispatch); if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for the facilities list."}; return {true, array_json(state.values), {}, {}};
#endif
}

Result SimConnectClient::flight_load(const std::string& path) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; if (FAILED(runtime().flight_load(static_cast<HANDLE>(handle_), path.c_str()))) return {false, {}, "SIMCONNECT_FLIGHT_LOAD_FAILED", "SimConnect rejected the flight file."}; return {true, "true", {}, {}};
#endif
}

Result SimConnectClient::ai_create_parked(const std::string& title, const std::string& tail_number, const std::string& airport) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); const DWORD request = next_id_++;
    if (FAILED(api.ai_create_parked(static_cast<HANDLE>(handle_), title.c_str(), tail_number.c_str(), airport.c_str(), request))) return {false, {}, "SIMCONNECT_AI_CREATE_FAILED", "SimConnect rejected the AI aircraft request."};
    ObjectId state{request}; wait_for(api, static_cast<HANDLE>(handle_), state, assigned_object_dispatch); if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for the AI object ID."}; return {true, std::to_string(state.object_id), {}, {}};
#endif
}

Result SimConnectClient::camera_acquire(const std::string& client_id) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; if (FAILED(runtime().camera_acquire(static_cast<HANDLE>(handle_), client_id.c_str()))) return {false, {}, "SIMCONNECT_CAMERA_ACQUIRE_FAILED", "SimConnect rejected the camera acquire request."}; return {true, "true", {}, {}};
#endif
}
Result SimConnectClient::camera_release(const std::string& camera_definition) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; if (FAILED(runtime().camera_release(static_cast<HANDLE>(handle_), camera_definition.c_str()))) return {false, {}, "SIMCONNECT_CAMERA_RELEASE_FAILED", "SimConnect rejected the camera release request."}; return {true, "true", {}, {}};
#endif
}
Result SimConnectClient::camera_status() {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready; auto& api = runtime(); if (FAILED(api.camera_get_status(static_cast<HANDLE>(handle_)))) return {false, {}, "SIMCONNECT_CAMERA_STATUS_FAILED", "SimConnect rejected the camera status request."};
    CameraStatus state{}; wait_for(api, static_cast<HANDLE>(handle_), state, camera_status_dispatch); if (!state.complete) return {false, {}, "SIMCONNECT_TIMEOUT", "Timed out waiting for camera status."}; return {true, json::object({{"acquired_state", std::to_string(state.state)}, {"game_controlled", state.game_controlled ? "true" : "false"}}), {}, {}};
#endif
}

Result SimConnectClient::get_efb_route(const std::string& correlation_id) {
#if !defined(MSFS_CLI_HAS_SIMCONNECT)
    return ensure_open();
#else
    const auto ready = ensure_open(); if (!ready.ok) return ready;
    auto& api = runtime();
    const DWORD event_id = next_id_++;
    if (FAILED(api.subscribe_commbus(static_cast<HANDLE>(handle_), event_id, "msfs.route.response"))) {
        return {false, {}, "ROUTE_BRIDGE_UNAVAILABLE", "Could not subscribe to the EFB route bridge CommBus response."};
    }
    const std::string request = json::object({{"requestId", json::quote(correlation_id)}});
    if (FAILED(api.call_commbus(static_cast<HANDLE>(handle_), "msfs.route.request", SIMCONNECT_COMM_BUS_BROADCAST_TO_WASM,
                                static_cast<DWORD>(request.size()), request.data()))) {
        api.unsubscribe_commbus(static_cast<HANDLE>(handle_), event_id);
        return {false, {}, "ROUTE_BRIDGE_UNAVAILABLE", "Could not call the EFB route bridge CommBus request."};
    }
    CommBusRoute state{event_id, correlation_id};
    wait_for(api, static_cast<HANDLE>(handle_), state, commbus_route_dispatch);
    api.unsubscribe_commbus(static_cast<HANDLE>(handle_), event_id);
    if (!state.error.empty()) return {false, {}, "ROUTE_NOT_FOUND", state.error};
    if (!state.complete) return {false, {}, "ROUTE_TIMEOUT", "The EFB route bridge did not respond within three seconds."};
    return {true, state.route_json, {}, {}};
#endif
}

}  // namespace msfs::simconnect
