#include "common/win_pipe.h"

#include <windows.h>

#include <array>

namespace msfs::pipe {
namespace {

constexpr DWORD kBufferSize = 64 * 1024;
// Desktop callers allow a CLI process up to 15 seconds. Keep the Pipe-instance
// wait below that budget so a request queued behind one slow SimConnect call is
// not misclassified as a disconnected simulator after the old 500ms window.
constexpr DWORD kPipeAvailabilityTimeoutMs = 10'000;

bool write_all(HANDLE handle, const std::string& message) {
    DWORD total_written = 0;
    while (total_written < message.size()) {
        DWORD written = 0;
        if (!WriteFile(handle, message.data() + total_written,
                       static_cast<DWORD>(message.size() - total_written), &written, nullptr)) {
            return false;
        }
        total_written += written;
    }
    return true;
}

std::optional<std::string> read_message(HANDLE handle, std::string& error_message) {
    std::string message;
    std::array<char, kBufferSize> buffer{};
    while (true) {
        DWORD read = 0;
        const BOOL read_ok = ReadFile(handle, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr);
        message.append(buffer.data(), read);
        if (read_ok) return message;
        const DWORD error = GetLastError();
        if (error == ERROR_MORE_DATA) continue;
        error_message = "ReadFile failed with Win32 error " + std::to_string(error);
        return std::nullopt;
    }
}

}  // namespace

const wchar_t* pipe_name(const DaemonRole role) {
    return role == DaemonRole::monitor ? kMonitorPipeName : kAiPipeName;
}

const wchar_t* mutex_name(const DaemonRole role) {
    return role == DaemonRole::monitor ? L"Local\\msfs-native-cli-daemon-monitor-v1"
                                      : L"Local\\msfs-native-cli-daemon-ai-v1";
}

const char* role_name(const DaemonRole role) {
    return role == DaemonRole::monitor ? "monitor" : "ai";
}

std::optional<DaemonRole> parse_role(const std::string_view value) {
    if (value == "monitor") return DaemonRole::monitor;
    if (value == "ai") return DaemonRole::ai;
    return std::nullopt;
}

std::optional<std::string> transact(const std::string& request, std::string& error_message, const wchar_t* pipe_name) {
    HANDLE handle = CreateFileW(pipe_name, GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
    if (handle == INVALID_HANDLE_VALUE && GetLastError() != ERROR_PIPE_BUSY) {
        error_message = "CreateFileW failed with Win32 error " + std::to_string(GetLastError());
        return std::nullopt;
    }

    // A direct open can distinguish a genuinely missing daemon from a busy
    // instance. Only the latter enters the bounded wait below, so first launch
    // keeps its existing fast daemon-start path.
    if (handle == INVALID_HANDLE_VALUE) {
        const ULONGLONG deadline = GetTickCount64() + kPipeAvailabilityTimeoutMs;
        while (handle == INVALID_HANDLE_VALUE) {
            const ULONGLONG now = GetTickCount64();
            if (now >= deadline) {
                error_message = "Named pipe remained busy for " + std::to_string(kPipeAvailabilityTimeoutMs) +
                                "ms (Win32 error " + std::to_string(ERROR_SEM_TIMEOUT) + ")";
                return std::nullopt;
            }

            const DWORD remaining_wait_ms = static_cast<DWORD>(deadline - now);
            if (!WaitNamedPipeW(pipe_name, remaining_wait_ms)) {
                const DWORD error = GetLastError();
                // serve_forever closes the handled instance before it creates the
                // next one. Once this client has observed a busy Pipe, that tiny
                // ERROR_FILE_NOT_FOUND gap is still part of the same wait, not a
                // missing daemon. Retry until the bounded deadline.
                if (error == ERROR_FILE_NOT_FOUND) {
                    Sleep(10);
                    continue;
                }
                error_message = "Named pipe is unavailable (Win32 error " + std::to_string(error) + ")";
                return std::nullopt;
            }

            handle = CreateFileW(pipe_name, GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr);
            if (handle == INVALID_HANDLE_VALUE && GetLastError() != ERROR_PIPE_BUSY &&
                GetLastError() != ERROR_FILE_NOT_FOUND) {
                error_message = "CreateFileW failed with Win32 error " + std::to_string(GetLastError());
                return std::nullopt;
            }
        }
    }

    DWORD mode = PIPE_READMODE_MESSAGE;
    if (!SetNamedPipeHandleState(handle, &mode, nullptr, nullptr)) {
        error_message = "SetNamedPipeHandleState failed with Win32 error " + std::to_string(GetLastError());
        CloseHandle(handle);
        return std::nullopt;
    }

    if (!write_all(handle, request)) {
        error_message = "WriteFile failed with Win32 error " + std::to_string(GetLastError());
        CloseHandle(handle);
        return std::nullopt;
    }

    auto response = read_message(handle, error_message);
    CloseHandle(handle);
    return response;
}

bool serve_once(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                const wchar_t* pipe_name) {
    HANDLE handle = CreateNamedPipeW(
        pipe_name,
        PIPE_ACCESS_DUPLEX,
        PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
        PIPE_UNLIMITED_INSTANCES,
        kBufferSize,
        kBufferSize,
        0,
        nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
        error_message = "CreateNamedPipeW failed with Win32 error " + std::to_string(GetLastError());
        return false;
    }

    const BOOL connected = ConnectNamedPipe(handle, nullptr);
    if (!connected && GetLastError() != ERROR_PIPE_CONNECTED) {
        error_message = "ConnectNamedPipe failed with Win32 error " + std::to_string(GetLastError());
        CloseHandle(handle);
        return false;
    }

    std::string read_error;
    const auto request = read_message(handle, read_error);
    if (!request.has_value()) {
        error_message = read_error;
        DisconnectNamedPipe(handle);
        CloseHandle(handle);
        return false;
    }

    const std::string response = handler(*request);
    const bool wrote = write_all(handle, response);
    if (!wrote) error_message = "WriteFile failed with Win32 error " + std::to_string(GetLastError());
    DisconnectNamedPipe(handle);
    CloseHandle(handle);
    return wrote;
}

bool serve_forever(const std::function<std::string(const std::string&)>& handler, std::string& error_message,
                   const wchar_t* pipe_name) {
    error_message.clear();
    while (true) {
        std::string ignored_error;
        serve_once(handler, ignored_error, pipe_name);
    }
}

}  // namespace msfs::pipe
