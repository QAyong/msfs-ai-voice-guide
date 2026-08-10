#pragma once

#include <functional>
#include <optional>
#include <string>
#include <string_view>

namespace msfs::pipe {

enum class DaemonRole {
    monitor,
    ai,
};

inline constexpr wchar_t kMonitorPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-monitor-v1";
inline constexpr wchar_t kAiPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-ai-v1";
inline constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-ai-v1";

const wchar_t* pipe_name(DaemonRole role);
const wchar_t* mutex_name(DaemonRole role);
const char* role_name(DaemonRole role);
std::optional<DaemonRole> parse_role(std::string_view value);

std::optional<std::string> transact(const std::string& request, std::string& error_message,
                                    const wchar_t* pipe_name = kPipeName);
bool serve_once(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                const wchar_t* pipe_name = kPipeName);
bool serve_forever(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                   const wchar_t* pipe_name = kPipeName);

}  // namespace msfs::pipe
