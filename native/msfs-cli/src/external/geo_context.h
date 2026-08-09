#pragma once

#include <memory>
#include <string>

namespace msfs::external::geo {

struct ContextRequest final {
    double latitude = 0.0;
    double longitude = 0.0;
    double altitude_m = 0.0;
    std::string detail = "auto";
    std::string locale = "zh-CN";
};

struct Config final {
    std::string backend;
    std::string base_url;
    std::string api_key;
    int timeout_seconds = 2;
};

struct Result final {
    bool ok = false;
    std::string body_json;
    std::string error_code;
    std::string message;
};

class ContextClient {
public:
    virtual ~ContextClient() = default;
    virtual Result context(const ContextRequest& request) = 0;
};

bool validate_request(const ContextRequest& request, std::string& error_message);
bool load_config(Config& config, std::string& error_message);
std::unique_ptr<ContextClient> create_client(const Config& config, std::string& error_message);

}  // namespace msfs::external::geo
