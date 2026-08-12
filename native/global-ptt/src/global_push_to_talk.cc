#include <node_api.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

struct GlobalPushToTalkEvent {
  bool pressed;
};

std::mutex hook_mutex;
std::condition_variable startup_condition;
std::condition_variable thread_id_condition;
std::thread hook_thread;
DWORD hook_thread_id = 0;
napi_threadsafe_function event_callback = nullptr;
bool startup_complete = false;
bool startup_succeeded = false;
bool thread_id_ready = false;
std::atomic_bool hook_running{false};
std::atomic_bool held{false};
std::atomic_bool matches_mouse_button{false};
std::atomic_bool callback_closing{false};
std::atomic<UINT> configured_virtual_key{0};
std::atomic<WORD> configured_mouse_button{0};

void CallJavaScript(napi_env env, napi_value js_callback, void*, void* data) {
  auto* event = static_cast<GlobalPushToTalkEvent*>(data);
  if (event == nullptr) return;

  if (env != nullptr && js_callback != nullptr) {
    napi_value global = nullptr;
    napi_value value = nullptr;
    napi_value type = nullptr;
    const bool values_ready = napi_get_global(env, &global) == napi_ok &&
                              napi_create_object(env, &value) == napi_ok &&
                              napi_create_string_utf8(env, event->pressed ? "press" : "release",
                                                      NAPI_AUTO_LENGTH, &type) == napi_ok &&
                              napi_set_named_property(env, value, "type", type) == napi_ok;
    if (values_ready) {
      napi_call_function(env, global, js_callback, 1, &value, nullptr);
    }
  }
  delete event;
}

bool Emit(bool pressed) {
  auto* event = new GlobalPushToTalkEvent{pressed};
  if (event_callback == nullptr) {
    delete event;
    return false;
  }

  const napi_status status = napi_call_threadsafe_function(event_callback, event, napi_tsfn_nonblocking);
  if (status != napi_ok) delete event;
  if (status == napi_closing) {
    callback_closing.store(true);
    PostThreadMessageW(GetCurrentThreadId(), WM_QUIT, 0, 0);
  }
  return status == napi_ok;
}

bool MatchesKeyboard(const KBDLLHOOKSTRUCT* key) {
  const UINT virtual_key = configured_virtual_key.load();
  if (virtual_key == VK_LMENU) {
    return key->vkCode == VK_LMENU ||
           (key->vkCode == VK_MENU && (key->flags & LLKHF_EXTENDED) == 0);
  }
  return key->vkCode == virtual_key;
}

LRESULT CALLBACK KeyboardHook(int code, WPARAM message, LPARAM parameter) {
  if (code != HC_ACTION || matches_mouse_button.load() || callback_closing.load()) {
    return CallNextHookEx(nullptr, code, message, parameter);
  }
  const auto* key = reinterpret_cast<KBDLLHOOKSTRUCT*>(parameter);
  if (!MatchesKeyboard(key)) return CallNextHookEx(nullptr, code, message, parameter);

  const bool pressed = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
  const bool released = message == WM_KEYUP || message == WM_SYSKEYUP;
  if (pressed && !held.exchange(true)) {
    Emit(true);
  } else if (released && held.exchange(false)) {
    Emit(false);
  }
  return 1;
}

LRESULT CALLBACK MouseHook(int code, WPARAM message, LPARAM parameter) {
  if (code != HC_ACTION || !matches_mouse_button.load() || callback_closing.load()) {
    return CallNextHookEx(nullptr, code, message, parameter);
  }
  if (message != WM_XBUTTONDOWN && message != WM_XBUTTONUP) {
    return CallNextHookEx(nullptr, code, message, parameter);
  }
  const auto* mouse = reinterpret_cast<MSLLHOOKSTRUCT*>(parameter);
  if (HIWORD(mouse->mouseData) != configured_mouse_button.load()) {
    return CallNextHookEx(nullptr, code, message, parameter);
  }
  if (message == WM_XBUTTONDOWN && !held.exchange(true)) {
    Emit(true);
  } else if (message == WM_XBUTTONUP && held.exchange(false)) {
    Emit(false);
  }
  return 1;
}

UINT VirtualKeyFromCode(const std::string& code) {
  if (code == "AltLeft") return VK_LMENU;
  if (code == "ControlRight") return VK_RCONTROL;
  if (code == "CapsLock") return VK_CAPITAL;
  if (code == "Space") return VK_SPACE;
  if (code == "Escape") return VK_ESCAPE;
  if (code == "Tab") return VK_TAB;
  if (code == "Enter") return VK_RETURN;
  if (code == "Backspace") return VK_BACK;
  if (code == "Insert") return VK_INSERT;
  if (code == "Delete") return VK_DELETE;
  if (code == "Home") return VK_HOME;
  if (code == "End") return VK_END;
  if (code == "PageUp") return VK_PRIOR;
  if (code == "PageDown") return VK_NEXT;
  if (code == "ArrowUp") return VK_UP;
  if (code == "ArrowDown") return VK_DOWN;
  if (code == "ArrowLeft") return VK_LEFT;
  if (code == "ArrowRight") return VK_RIGHT;
  if (code == "PrintScreen") return VK_SNAPSHOT;
  if (code == "Pause") return VK_PAUSE;
  if (code == "ScrollLock") return VK_SCROLL;
  if (code == "NumLock") return VK_NUMLOCK;

  if (code.size() == 4 && code.rfind("Key", 0) == 0 && code[3] >= 'A' && code[3] <= 'Z') {
    return static_cast<UINT>(code[3]);
  }
  if (code.size() == 6 && code.rfind("Digit", 0) == 0 && code[5] >= '0' && code[5] <= '9') {
    return static_cast<UINT>(code[5]);
  }
  if (code.size() >= 2 && code.size() <= 3 && code[0] == 'F') {
    int function_key = 0;
    for (size_t index = 1; index < code.size(); ++index) {
      if (code[index] < '0' || code[index] > '9') return 0;
      function_key = function_key * 10 + (code[index] - '0');
    }
    if (function_key >= 1 && function_key <= 24) return VK_F1 + function_key - 1;
  }
  if (code.size() == 7 && code.rfind("Numpad", 0) == 0 && code[6] >= '0' && code[6] <= '9') {
    return VK_NUMPAD0 + (code[6] - '0');
  }

  if (code == "NumpadAdd") return VK_ADD;
  if (code == "NumpadSubtract") return VK_SUBTRACT;
  if (code == "NumpadMultiply") return VK_MULTIPLY;
  if (code == "NumpadDivide") return VK_DIVIDE;
  if (code == "NumpadDecimal") return VK_DECIMAL;
  if (code == "NumpadEnter") return VK_RETURN;

  if (code == "Minus") return VK_OEM_MINUS;
  if (code == "Equal") return VK_OEM_PLUS;
  if (code == "BracketLeft") return VK_OEM_4;
  if (code == "BracketRight") return VK_OEM_6;
  if (code == "Backslash") return VK_OEM_5;
  if (code == "Semicolon") return VK_OEM_1;
  if (code == "Quote") return VK_OEM_7;
  if (code == "Backquote") return VK_OEM_3;
  if (code == "Comma") return VK_OEM_COMMA;
  if (code == "Period") return VK_OEM_PERIOD;
  if (code == "Slash") return VK_OEM_2;
  return 0;
}

void HookThread() {
  MSG message{};
  PeekMessageW(&message, nullptr, WM_USER, WM_USER, PM_NOREMOVE);
  {
    std::lock_guard<std::mutex> lock(hook_mutex);
    hook_thread_id = GetCurrentThreadId();
    thread_id_ready = true;
  }
  thread_id_condition.notify_all();

  const auto keyboard = matches_mouse_button.load()
                            ? nullptr
                            : SetWindowsHookExW(WH_KEYBOARD_LL, KeyboardHook, nullptr, 0);
  const auto mouse = matches_mouse_button.load()
                         ? SetWindowsHookExW(WH_MOUSE_LL, MouseHook, nullptr, 0)
                         : nullptr;
  {
    std::lock_guard<std::mutex> lock(hook_mutex);
    hook_running.store(keyboard != nullptr || mouse != nullptr);
    startup_succeeded = hook_running.load();
    startup_complete = true;
  }
  startup_condition.notify_all();

  if (hook_running.load()) {
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
  }

  if (keyboard != nullptr) UnhookWindowsHookEx(keyboard);
  if (mouse != nullptr) UnhookWindowsHookEx(mouse);
  napi_threadsafe_function callback = nullptr;
  {
    std::lock_guard<std::mutex> lock(hook_mutex);
    hook_running.store(false);
    held.store(false);
    hook_thread_id = 0;
    callback = event_callback;
    event_callback = nullptr;
  }
  if (callback != nullptr) napi_release_threadsafe_function(callback, napi_tsfn_abort);
}

void StopHook() {
  DWORD thread_id = 0;
  {
    std::unique_lock<std::mutex> lock(hook_mutex);
    if (!hook_thread.joinable()) return;
    thread_id_condition.wait(lock, [] { return thread_id_ready; });
    thread_id = hook_thread_id;
  }
  if (thread_id != 0) PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
  if (hook_thread.joinable()) hook_thread.join();
}

void CleanupHook(void*) { StopHook(); }

napi_value Stop(napi_env env, napi_callback_info) {
  StopHook();
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value Start(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_get_boolean(env, false, &result);
  size_t count = 2;
  napi_value arguments[2];
  if (napi_get_cb_info(env, info, &count, arguments, nullptr, nullptr) != napi_ok || count != 2) {
    return result;
  }

  napi_valuetype callback_type;
  if (napi_typeof(env, arguments[1], &callback_type) != napi_ok || callback_type != napi_function) {
    return result;
  }

  size_t length = 0;
  if (napi_get_value_string_utf8(env, arguments[0], nullptr, 0, &length) != napi_ok || length > 32) {
    return result;
  }
  std::vector<char> code_buffer(length + 1);
  if (napi_get_value_string_utf8(env, arguments[0], code_buffer.data(), code_buffer.size(), &length) != napi_ok) {
    return result;
  }
  const std::string code(code_buffer.data(), length);

  const bool is_mouse = code == "MouseX1" || code == "MouseX2";
  const UINT virtual_key = is_mouse ? 0 : VirtualKeyFromCode(code);
  if (!is_mouse && virtual_key == 0) return result;

  StopHook();
  napi_value resource_name = nullptr;
  if (napi_create_string_utf8(env, "global_push_to_talk", NAPI_AUTO_LENGTH, &resource_name) != napi_ok ||
      napi_create_threadsafe_function(env, arguments[1], nullptr, resource_name, 0, 1, nullptr, nullptr,
                                      nullptr, CallJavaScript, &event_callback) != napi_ok) {
    event_callback = nullptr;
    return result;
  }

  {
    std::lock_guard<std::mutex> lock(hook_mutex);
    configured_virtual_key.store(virtual_key);
    configured_mouse_button.store(code == "MouseX1" ? XBUTTON1 : XBUTTON2);
    matches_mouse_button.store(is_mouse);
    held.store(false);
    callback_closing.store(false);
    startup_complete = false;
    startup_succeeded = false;
    thread_id_ready = false;
  }

  hook_thread = std::thread(HookThread);

  {
    std::unique_lock<std::mutex> lock(hook_mutex);
    startup_condition.wait(lock, [] { return startup_complete; });
  }
  if (!startup_succeeded) {
    StopHook();
    return result;
  }
  napi_get_boolean(env, true, &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, descriptors);
  napi_add_env_cleanup_hook(env, CleanupHook, nullptr);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

#else

napi_value Init(napi_env env, napi_value exports) { return exports; }
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

#endif
