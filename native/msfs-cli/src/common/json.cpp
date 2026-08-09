#include "common/json.h"

#include <cctype>
#include <cstdlib>

namespace msfs::json {

std::string escape(std::string_view value) {
    std::string result;
    result.reserve(value.size() + 8);
    for (const unsigned char ch : value) {
        switch (ch) {
            case '\\': result += "\\\\"; break;
            case '"': result += "\\\""; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (ch < 0x20) {
                    constexpr char hex[] = "0123456789abcdef";
                    result += "\\u00";
                    result += hex[(ch >> 4) & 0x0f];
                    result += hex[ch & 0x0f];
                } else {
                    result += static_cast<char>(ch);
                }
        }
    }
    return result;
}

std::string quote(std::string_view value) {
    return "\"" + escape(value) + "\"";
}

std::string object(const std::vector<std::pair<std::string, std::string>>& fields) {
    std::string result = "{";
    for (size_t index = 0; index < fields.size(); ++index) {
        if (index != 0) result += ",";
        result += quote(fields[index].first);
        result += ":";
        result += fields[index].second;
    }
    result += "}";
    return result;
}

std::string ok(std::string_view request_id, std::string_view data_json) {
    return object({
        {"id", quote(request_id)},
        {"ok", "true"},
        {"data", std::string(data_json)},
    });
}

std::string error(std::string_view request_id, std::string_view code, std::string_view message) {
    return object({
        {"id", quote(request_id)},
        {"ok", "false"},
        {"error", object({
            {"code", quote(code)},
            {"message", quote(message)},
        })},
    });
}

std::optional<std::string> string_at(std::string_view document, std::string_view key) {
    const std::string needle = quote(key);
    const size_t key_position = document.find(needle);
    if (key_position == std::string_view::npos) return std::nullopt;

    size_t cursor = document.find(':', key_position + needle.size());
    if (cursor == std::string_view::npos) return std::nullopt;
    ++cursor;
    while (cursor < document.size() && std::isspace(static_cast<unsigned char>(document[cursor]))) ++cursor;
    if (cursor >= document.size() || document[cursor] != '"') return std::nullopt;

    ++cursor;
    std::string value;
    while (cursor < document.size()) {
        const char ch = document[cursor++];
        if (ch == '"') return value;
        if (ch != '\\') {
            value += ch;
            continue;
        }
        if (cursor >= document.size()) return std::nullopt;
        const char escaped = document[cursor++];
        switch (escaped) {
            case '"': value += '"'; break;
            case '\\': value += '\\'; break;
            case 'n': value += '\n'; break;
            case 'r': value += '\r'; break;
            case 't': value += '\t'; break;
            default: return std::nullopt;
        }
    }
    return std::nullopt;
}

std::optional<double> number_at(std::string_view document, std::string_view key) {
    const std::string needle = quote(key);
    const size_t key_position = document.find(needle);
    if (key_position == std::string_view::npos) return std::nullopt;

    size_t cursor = document.find(':', key_position + needle.size());
    if (cursor == std::string_view::npos) return std::nullopt;
    ++cursor;
    while (cursor < document.size() && std::isspace(static_cast<unsigned char>(document[cursor]))) ++cursor;
    const char* begin = document.data() + cursor;
    char* end = nullptr;
    const double value = std::strtod(begin, &end);
    if (end == begin) return std::nullopt;
    return value;
}

}  // namespace msfs::json
