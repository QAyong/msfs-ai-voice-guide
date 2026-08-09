#include "external/geo_context.h"

#include <windows.h>

#include <iostream>
#include <string>

int main() {
    std::string error;
    msfs::external::geo::ContextRequest valid{};
    if (!msfs::external::geo::validate_request(valid, error)) {
        std::cerr << "Expected default request to validate: " << error << '\n';
        return 1;
    }
    valid.latitude = 91.0;
    if (msfs::external::geo::validate_request(valid, error)) {
        std::cerr << "Out-of-range latitude was accepted\n";
        return 1;
    }

    SetEnvironmentVariableA("MSFS_GEO_BACKEND", "cloud");
    SetEnvironmentVariableA("MSFS_GEO_CLOUD_BASE_URL", "https://geo.example.test");
    SetEnvironmentVariableA("MSFS_GEO_API_KEY", "test-key");
    SetEnvironmentVariableA("MSFS_GEO_TIMEOUT_SECONDS", "3");
    msfs::external::geo::Config config{};
    if (!msfs::external::geo::load_config(config, error) || config.timeout_seconds != 3 || config.backend != "cloud") {
        std::cerr << "Cloud configuration was not loaded: " << error << '\n';
        return 1;
    }
    SetEnvironmentVariableA("MSFS_GEO_BACKEND", "amap");
    if (msfs::external::geo::load_config(config, error)) {
        std::cerr << "A direct map provider unexpectedly bypassed Geo Cloud\n";
        return 1;
    }
    return 0;
}
