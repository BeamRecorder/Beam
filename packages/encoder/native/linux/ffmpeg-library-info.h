#pragma once

#include <dlfcn.h>
#include <iostream>
#include <stdexcept>
#include <string>

namespace beam {
inline void print_json_string(const char *value) {
  static constexpr char hex[] = "0123456789abcdef";
  std::cout << '"';
  for (const auto *cursor = value; *cursor; ++cursor) {
    const auto character = static_cast<unsigned char>(*cursor);
    if (character == '"' || character == '\\')
      std::cout << '\\' << *cursor;
    else if (character < 32)
      std::cout << "\\u00" << hex[character >> 4] << hex[character & 15];
    else
      std::cout << *cursor;
  }
  std::cout << '"';
}

inline void print_ffmpeg_library_info() {
  const char *libraries[] = {"avcodec", "avutil", "avfilter", "avformat"};
  using TextFunction = const char *(*)();
  std::cout << '[';
  bool separator = false;
  for (const auto &library : libraries) {
    if (separator)
      std::cout << ',';
    separator = true;
    Dl_info origin{};
    const auto name = std::string(library);
    // Skip executable PLT trampolines: inspect the implementation in the DSO.
    const auto license_address = dlsym(RTLD_NEXT, (name + "_license").c_str());
    const auto license = reinterpret_cast<TextFunction>(license_address);
    const auto configuration = reinterpret_cast<TextFunction>(
        dlsym(RTLD_NEXT, (name + "_configuration").c_str()));
    if (!license || !configuration)
      throw std::runtime_error("Cannot inspect dynamically linked " + name);
    const bool shared = dladdr(license_address, &origin) && origin.dli_fname;
    std::cout << "{\"library\":";
    print_json_string(library);
    std::cout << ",\"license\":";
    print_json_string(license());
    std::cout << ",\"configuration\":";
    print_json_string(configuration());
    std::cout << ",\"path\":";
    print_json_string(shared ? origin.dli_fname : "");
    std::cout << '}';
  }
  std::cout << "]\n";
}
} // namespace beam
