#pragma once

#include <array>
#include <cstdint>
#include <string>

namespace msfs::simconnect {

struct Result final {
    bool ok;
    std::string value_json;
    std::string error_code;
    std::string message;
};

class SimConnectClient final {
public:
    SimConnectClient();
    ~SimConnectClient();
    void shutdown();

    SimConnectClient(const SimConnectClient&) = delete;
    SimConnectClient& operator=(const SimConnectClient&) = delete;

    [[nodiscard]] bool sdk_compiled() const;
    [[nodiscard]] bool connected() const;
    [[nodiscard]] std::string status_json();
    Result get_float64(const std::string& variable, const std::string& unit);
    Result get_string(const std::string& variable, const std::string& unit);
    Result set_float64(const std::string& variable, const std::string& unit, double value);
    Result get_system_state(const std::string& state_name);
    Result send_key_event(const std::string& event_name, std::array<std::uint32_t, 5> data = {});
    Result list_input_events();
    Result set_input_event(std::uint64_t hash, double value);
    Result list_facilities(const std::string& type, double radius_nm = 0.0);
    Result flight_load(const std::string& path);
    Result ai_create_parked(const std::string& title, const std::string& tail_number, const std::string& airport);
    Result camera_acquire(const std::string& client_id);
    Result camera_release(const std::string& camera_definition);
    Result camera_status();
    Result get_efb_route(const std::string& correlation_id);

private:
    Result ensure_open();
    void refresh_connection_state();
    void close_connection();
#if defined(MSFS_CLI_HAS_SIMCONNECT)
    void* handle_ = nullptr;
    unsigned long next_id_ = 1;
#endif
    bool connected_ = false;
};

}  // namespace msfs::simconnect
