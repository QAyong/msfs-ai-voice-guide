#pragma once

#include <string>

namespace msfs::catalog {

std::string search_simvars_json(const std::string& query);
std::string show_simvar_json(const std::string& name);
std::string search_events_json(const std::string& query);

}  // namespace msfs::catalog
