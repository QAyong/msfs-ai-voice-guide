#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace msfs::json {

std::string escape(std::string_view value);
std::string quote(std::string_view value);
std::string object(const std::vector<std::pair<std::string, std::string>>& fields);
std::string ok(std::string_view request_id, std::string_view data_json);
std::string error(std::string_view request_id, std::string_view code, std::string_view message);
std::optional<std::string> string_at(std::string_view document, std::string_view key);
std::optional<double> number_at(std::string_view document, std::string_view key);

}  // namespace msfs::json
