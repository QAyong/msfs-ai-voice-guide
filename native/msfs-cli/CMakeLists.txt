cmake_minimum_required(VERSION 3.25)

project(msfs_native_cli VERSION 0.1.0 LANGUAGES CXX)

if(NOT WIN32)
    message(FATAL_ERROR "MSFS Native CLI only supports Windows because SimConnect is a Windows SDK.")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(MSFS2024_SDK_ROOT "$ENV{MSFS2024_SDK}" CACHE PATH "MSFS 2024 SDK root")

add_library(msfs_core STATIC
    src/common/json.cpp
    src/common/win_pipe.cpp
    src/catalog/catalog.cpp
    src/external/geo_context.cpp
    src/simconnect/simconnect_client.cpp
)

target_include_directories(msfs_core PUBLIC src)
target_compile_definitions(msfs_core PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(msfs_core PRIVATE /W4 /permissive-)

set(SIMCONNECT_INCLUDE_DIR "${MSFS2024_SDK_ROOT}/SimConnect SDK/include")
set(SIMCONNECT_RUNTIME "${MSFS2024_SDK_ROOT}/SimConnect SDK/lib/SimConnect.dll")
if(EXISTS "${SIMCONNECT_INCLUDE_DIR}/SimConnect.h")
    message(STATUS "Building with MSFS 2024 SimConnect SDK: ${MSFS2024_SDK_ROOT}")
    target_compile_definitions(msfs_core PRIVATE MSFS_CLI_HAS_SIMCONNECT=1)
    target_include_directories(msfs_core PRIVATE "${SIMCONNECT_INCLUDE_DIR}")
    target_link_libraries(msfs_core PRIVATE user32 shlwapi ws2_32)
    # SimConnect.dll is loaded dynamically by msfsd. This preserves offline
    # catalog/status commands when MSFS or the runtime DLL is not available.
else()
    message(WARNING "MSFS2024_SDK_ROOT is not configured. Building mock mode; SimConnect commands return SDK_NOT_CONFIGURED.")
endif()

target_link_libraries(msfs_core PRIVATE winhttp)

add_executable(msfs src/cli/main.cpp)
target_link_libraries(msfs PRIVATE msfs_core)
target_compile_definitions(msfs PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(msfs PRIVATE /W4 /permissive-)

add_executable(msfsd src/daemon/main.cpp)
target_link_libraries(msfsd PRIVATE msfs_core)
target_compile_definitions(msfsd PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
target_compile_options(msfsd PRIVATE /W4 /permissive-)

if(EXISTS "${SIMCONNECT_RUNTIME}")
    add_custom_command(TARGET msfsd POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${SIMCONNECT_RUNTIME}" "$<TARGET_FILE_DIR:msfsd>"
        COMMENT "Deploying SimConnect.dll beside msfsd.exe")
else()
    message(WARNING "SimConnect.dll was not found under MSFS2024_SDK_ROOT; msfsd.exe will require it on PATH at runtime.")
endif()

enable_testing()
add_executable(protocol_json_test tests/unit/protocol_json_test.cpp)
target_link_libraries(protocol_json_test PRIVATE msfs_core)
target_compile_definitions(protocol_json_test PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
add_test(NAME protocol_json_test COMMAND protocol_json_test)

add_executable(named_pipe_test tests/integration/named_pipe_test.cpp)
target_link_libraries(named_pipe_test PRIVATE msfs_core)
target_compile_definitions(named_pipe_test PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
add_test(NAME named_pipe_test COMMAND named_pipe_test)

add_executable(dual_daemon_test tests/integration/dual_daemon_test.cpp)
target_link_libraries(dual_daemon_test PRIVATE msfs_core)
target_compile_definitions(dual_daemon_test PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
add_test(NAME dual_daemon_test COMMAND dual_daemon_test)
set_tests_properties(dual_daemon_test PROPERTIES TIMEOUT 30)

add_executable(geo_context_test tests/unit/geo_context_test.cpp)
target_link_libraries(geo_context_test PRIVATE msfs_core)
target_compile_definitions(geo_context_test PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
add_test(NAME geo_context_test COMMAND geo_context_test)

find_program(POWERSHELL_EXECUTABLE NAMES powershell pwsh REQUIRED)
add_custom_target(msfs_route_bridge
    COMMAND "${POWERSHELL_EXECUTABLE}" -NoProfile -ExecutionPolicy Bypass
        -File "${CMAKE_CURRENT_SOURCE_DIR}/wasm-route-bridge/build.ps1"
        -SdkRoot "${MSFS2024_SDK_ROOT}"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "Building the MSFS 2024 EFB Planned Route WASM bridge")

add_test(
    NAME cli_contract_test
    COMMAND "${POWERSHELL_EXECUTABLE}" -NoProfile -ExecutionPolicy Bypass
        -File "${CMAKE_CURRENT_SOURCE_DIR}/tests/integration/cli_contract_test.ps1"
        -Cli "$<TARGET_FILE:msfs>"
)
set_tests_properties(cli_contract_test PROPERTIES TIMEOUT 30)

add_test(
    NAME geo_coverage_e2e_test
    COMMAND "${POWERSHELL_EXECUTABLE}" -NoProfile -ExecutionPolicy Bypass
        -File "${CMAKE_CURRENT_SOURCE_DIR}/tests/e2e/geo_coverage_test.ps1"
        -Cli "$<TARGET_FILE:msfs>"
        -ReportPath "${CMAKE_CURRENT_BINARY_DIR}/geo_coverage_report.json"
)
set_tests_properties(geo_coverage_e2e_test PROPERTIES SKIP_RETURN_CODE 77 TIMEOUT 90)
