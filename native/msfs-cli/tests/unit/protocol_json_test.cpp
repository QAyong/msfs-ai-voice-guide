#include "common/json.h"

#include <iostream>

int main() {
    const std::string document = msfs::json::object({
        {"name", msfs::json::quote("PLANE ALTITUDE")},
        {"unit", msfs::json::quote("feet")},
    });
    const auto name = msfs::json::string_at(document, "name");
    const auto unit = msfs::json::string_at(document, "unit");
    if (!name.has_value() || *name != "PLANE ALTITUDE" || !unit.has_value() || *unit != "feet") {
        std::cerr << "JSON protocol round trip failed\n";
        return 1;
    }
    return 0;
}
