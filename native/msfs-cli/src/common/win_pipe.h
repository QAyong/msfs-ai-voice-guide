#pragma once

#include <functional>
#include <optional>
#include <string>

namespace msfs::pipe {

inline constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\msfs-native-cli-v1";

std::optional<std::string> transact(const std::string& request, std::string& error_message,
                                    const wchar_t* pipe_name = kPipeName);
bool serve_once(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                const wchar_t* pipe_name = kPipeName);
bool serve_forever(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                   const wchar_t* pipe_name = kPipeName);

}  // namespace msfs::pipe
