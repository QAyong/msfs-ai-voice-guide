#include "external/geo_context.h"

#include "common/json.h"

#include <windows.h>
#include <winhttp.h>

#include <cmath>
#include <limits>
#include <memory>
#include <string_view>
#include <vector>

namespace msfs::external::geo {
namespace {

std::string environment(const char* name) {
    const DWORD size = GetEnvironmentVariableA(name, nullptr, 0);
    if (size == 0) return {};
    std::string value(size, '\0');
    const DWORD written = GetEnvironmentVariableA(name, value.data(), size);
    if (written == 0 || written >= size) return {};
    value.resize(written);
    return value;
}

std::wstring wide(std::string_view value) {
    if (value.empty()) return {};
    const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (size <= 0) return {};
    std::wstring output(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), output.data(), size);
    return output;
}

bool valid_detail(std::string_view detail) {
    return detail == "auto" || detail == "coarse" || detail == "full";
}

class WinHttpHandle final {
public:
    explicit WinHttpHandle(HINTERNET value = nullptr) : value_(value) {}
    ~WinHttpHandle() { if (value_ != nullptr) WinHttpCloseHandle(value_); }
    WinHttpHandle(const WinHttpHandle&) = delete;
    WinHttpHandle& operator=(const WinHttpHandle&) = delete;
    [[nodiscard]] HINTERNET get() const { return value_; }
private:
    HINTERNET value_;
};

class CloudContextClient final : public ContextClient {
public:
    explicit CloudContextClient(Config config) : config_(std::move(config)) {}

    Result context(const ContextRequest& request) override {
        std::string validation_error;
        if (!validate_request(request, validation_error)) return {false, {}, "EXTERNAL_GEO_INVALID_REQUEST", validation_error};

        const std::wstring url = wide(config_.base_url + "/v1/location-context");
        URL_COMPONENTS components{};
        components.dwStructSize = sizeof(components);
        components.dwSchemeLength = static_cast<DWORD>(-1);
        components.dwHostNameLength = static_cast<DWORD>(-1);
        components.dwUrlPathLength = static_cast<DWORD>(-1);
        components.dwExtraInfoLength = static_cast<DWORD>(-1);
        if (url.empty() || !WinHttpCrackUrl(url.c_str(), static_cast<DWORD>(url.size()), 0, &components) ||
            components.nScheme != INTERNET_SCHEME_HTTPS) {
            return {false, {}, "EXTERNAL_GEO_CONFIG_INVALID", "MSFS_GEO_CLOUD_BASE_URL must be a valid HTTPS URL."};
        }

        std::wstring host(components.lpszHostName, components.dwHostNameLength);
        std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
        if (components.dwExtraInfoLength > 0) path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
        if (path.empty()) path = L"/v1/location-context";

        WinHttpHandle session(WinHttpOpen(L"msfs-native-cli/0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                          WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
        if (session.get() == nullptr) return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Could not create an HTTPS client."};
        const int timeout_ms = config_.timeout_seconds * 1000;
        WinHttpSetTimeouts(session.get(), timeout_ms, timeout_ms, timeout_ms, timeout_ms);

        WinHttpHandle connection(WinHttpConnect(session.get(), host.c_str(), components.nPort, 0));
        if (connection.get() == nullptr) return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Could not connect to Geo Cloud."};
        WinHttpHandle http_request(WinHttpOpenRequest(connection.get(), L"POST", path.c_str(), nullptr,
                                                       WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                                       WINHTTP_FLAG_SECURE));
        if (http_request.get() == nullptr) return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Could not create the Geo Cloud request."};

        const std::string body = json::object({
            {"lat", std::to_string(request.latitude)},
            {"lon", std::to_string(request.longitude)},
            {"alt_m", std::to_string(request.altitude_m)},
            {"detail", json::quote(request.detail)},
            {"locale", json::quote(request.locale)},
        });
        const std::wstring headers = L"Content-Type: application/json\r\nX-MSFS-Geo-Key: " + wide(config_.api_key);
        if (!WinHttpSendRequest(http_request.get(), headers.c_str(), static_cast<DWORD>(headers.size()),
                                const_cast<char*>(body.data()), static_cast<DWORD>(body.size()),
                                static_cast<DWORD>(body.size()), 0) ||
            !WinHttpReceiveResponse(http_request.get(), nullptr)) {
            return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Geo Cloud did not respond before the request timed out."};
        }

        DWORD status = 0;
        DWORD status_size = sizeof(status);
        if (!WinHttpQueryHeaders(http_request.get(), WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                                 WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size, WINHTTP_NO_HEADER_INDEX)) {
            return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Geo Cloud returned an unreadable HTTP response."};
        }

        std::string response;
        while (true) {
            DWORD available = 0;
            if (!WinHttpQueryDataAvailable(http_request.get(), &available)) break;
            if (available == 0) break;
            const size_t offset = response.size();
            response.resize(offset + available);
            DWORD read = 0;
            if (!WinHttpReadData(http_request.get(), response.data() + offset, available, &read)) break;
            response.resize(offset + read);
        }
        if (status >= 200 && status < 300) return {true, response, {}, {}};
        if (status == 401 || status == 403) return {false, {}, "EXTERNAL_GEO_AUTH_FAILED", "Geo Cloud rejected MSFS_GEO_API_KEY."};
        if (status >= 500) return {false, {}, "EXTERNAL_GEO_UNAVAILABLE", "Geo Cloud is temporarily unavailable."};
        return {false, {}, "EXTERNAL_GEO_REQUEST_FAILED", "Geo Cloud rejected the geographic context request."};
    }

private:
    Config config_;
};

}  // namespace

bool validate_request(const ContextRequest& request, std::string& error_message) {
    if (!std::isfinite(request.latitude) || request.latitude < -90.0 || request.latitude > 90.0) {
        error_message = "Latitude must be a finite WGS84 value from -90 to 90.";
        return false;
    }
    if (!std::isfinite(request.longitude) || request.longitude < -180.0 || request.longitude > 180.0) {
        error_message = "Longitude must be a finite WGS84 value from -180 to 180.";
        return false;
    }
    if (!std::isfinite(request.altitude_m) || request.altitude_m < -1000.0 || request.altitude_m > 100000.0) {
        error_message = "Altitude must be a finite value from -1000 to 100000 metres.";
        return false;
    }
    if (!valid_detail(request.detail)) {
        error_message = "detail must be auto, coarse, or full.";
        return false;
    }
    if (request.locale.empty()) {
        error_message = "locale must not be empty.";
        return false;
    }
    return true;
}

bool load_config(Config& config, std::string& error_message) {
    config.backend = environment("MSFS_GEO_BACKEND");
    if (config.backend.empty()) config.backend = "cloud";
    config.base_url = environment("MSFS_GEO_CLOUD_BASE_URL");
    config.api_key = environment("MSFS_GEO_API_KEY");
    const std::string timeout = environment("MSFS_GEO_TIMEOUT_SECONDS");
    if (!timeout.empty()) {
        try { config.timeout_seconds = std::stoi(timeout); }
        catch (...) { error_message = "MSFS_GEO_TIMEOUT_SECONDS must be a whole number."; return false; }
    }
    if (config.backend != "cloud") {
        error_message = "MSFS_GEO_BACKEND currently supports only cloud; map providers belong inside Geo Cloud.";
        return false;
    }
    if (config.base_url.empty() || config.api_key.empty()) {
        error_message = "MSFS_GEO_CLOUD_BASE_URL and MSFS_GEO_API_KEY must be configured.";
        return false;
    }
    if (config.timeout_seconds < 1 || config.timeout_seconds > 10) {
        error_message = "MSFS_GEO_TIMEOUT_SECONDS must be from 1 to 10.";
        return false;
    }
    return true;
}

std::unique_ptr<ContextClient> create_client(const Config& config, std::string& error_message) {
    if (config.backend == "cloud") return std::make_unique<CloudContextClient>(config);
    error_message = "No client is registered for the requested MSFS_GEO_BACKEND.";
    return nullptr;
}

}  // namespace msfs::external::geo
