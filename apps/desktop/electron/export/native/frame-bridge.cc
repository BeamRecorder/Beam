#include "frame-protocol.h"
#include <cerrno>
#include <cmath>
#include <cstring>
#include <fcntl.h>
#include <limits>
#include <memory>
#include <node_api.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace {
void check(napi_status status) {
  if (status != napi_ok)
    throw std::runtime_error("Invalid native GPU transport argument");
}
std::string string(napi_env env, napi_value value) {
  size_t length;
  check(napi_get_value_string_utf8(env, value, nullptr, 0, &length));
  if (!length || length > 107)
    throw std::runtime_error("GPU transport metadata is too long or empty");
  char bytes[108]{};
  check(napi_get_value_string_utf8(env, value, bytes, sizeof(bytes), &length));
  if (std::strlen(bytes) != length)
    throw std::runtime_error("GPU transport metadata contains a null byte");
  return std::string(bytes, length);
}
uint64_t number(const std::string &value, uint64_t maximum) {
  if (value.find_first_not_of("0123456789") != std::string::npos)
    throw std::runtime_error("Expected unsigned decimal GPU metadata");
  const auto result = std::stoull(value);
  if (result > maximum)
    throw std::runtime_error("GPU metadata integer overflow");
  return result;
}
struct Transfer {
  beam::FrameDescriptor frame;
  std::string path, error;
  int descriptor = -1, connection = -1;
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
  ~Transfer() {
    if (descriptor >= 0)
      close(descriptor);
    if (connection >= 0)
      close(connection);
  }
};
void execute(napi_env, void *data) {
  auto &transfer = *static_cast<Transfer *>(data);
  try {
    sockaddr_un address{};
    address.sun_family = AF_UNIX;
    std::strcpy(address.sun_path, transfer.path.c_str());
    transfer.connection = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
    if (transfer.connection < 0)
      throw std::runtime_error("Cannot create GPU transport socket");
    timeval timeout{15, 0};
    if (setsockopt(transfer.connection, SOL_SOCKET, SO_RCVTIMEO, &timeout,
                   sizeof(timeout)) ||
        setsockopt(transfer.connection, SOL_SOCKET, SO_SNDTIMEO, &timeout,
                   sizeof(timeout)))
      throw std::runtime_error("Cannot bound GPU transport waits");
    if (connect(transfer.connection, reinterpret_cast<sockaddr *>(&address),
                sizeof(address)))
      throw std::runtime_error(std::string("Connect GPU exporter: ") +
                               std::strerror(errno));
    iovec payload{&transfer.frame, sizeof(transfer.frame)};
    alignas(cmsghdr) char control[CMSG_SPACE(sizeof(int))]{};
    msghdr message{};
    message.msg_iov = &payload;
    message.msg_iovlen = 1;
    message.msg_control = control;
    message.msg_controllen = sizeof(control);
    auto *header = CMSG_FIRSTHDR(&message);
    header->cmsg_level = SOL_SOCKET;
    header->cmsg_type = SCM_RIGHTS;
    header->cmsg_len = CMSG_LEN(sizeof(int));
    std::memcpy(CMSG_DATA(header), &transfer.descriptor, sizeof(int));
    if (sendmsg(transfer.connection, &message, MSG_NOSIGNAL) !=
        sizeof(transfer.frame))
      throw std::runtime_error("Unable to send DMA-BUF descriptor");
    char reply[512]{};
    const auto received = recv(transfer.connection, reply, sizeof(reply), 0);
    if (received != 2 || std::memcmp(reply, "ok", 2))
      throw std::runtime_error(
          received > 0 ? std::string(reply, received)
                       : "GPU exporter closed before acknowledging the frame");
  } catch (const std::exception &error) {
    transfer.error = error.what();
  }
}
void complete(napi_env env, napi_status status, void *data) {
  std::unique_ptr<Transfer> transfer(static_cast<Transfer *>(data));
  napi_delete_async_work(env, transfer->work);
  if (status != napi_ok && transfer->error.empty())
    transfer->error = "GPU descriptor transfer cancelled";
  napi_value result;
  if (transfer->error.empty()) {
    napi_get_undefined(env, &result);
    napi_resolve_deferred(env, transfer->deferred, result);
  } else {
    napi_value message;
    napi_create_string_utf8(env, transfer->error.c_str(), NAPI_AUTO_LENGTH,
                            &message);
    napi_create_error(env, nullptr, message, &result);
    napi_reject_deferred(env, transfer->deferred, result);
  }
}
napi_value send(napi_env env, napi_callback_info info) {
  auto transfer = std::make_unique<Transfer>();
  try {
    napi_value arguments[3];
    size_t count = 3;
    check(napi_get_cb_info(env, info, &count, arguments, nullptr, nullptr));
    if (count != 2)
      throw std::runtime_error("Expected a descriptor and GPU metadata");
    double descriptor;
    check(napi_get_value_double(env, arguments[0], &descriptor));
    if (!std::isfinite(descriptor) || descriptor < 3 ||
        descriptor > std::numeric_limits<int>::max() ||
        std::floor(descriptor) != descriptor)
      throw std::runtime_error("Invalid DMA-BUF descriptor");
    bool array;
    uint32_t length;
    check(napi_is_array(env, arguments[1], &array));
    check(napi_get_array_length(env, arguments[1], &length));
    if (!array || length != 9)
      throw std::runtime_error("Invalid GPU metadata array");
    std::string values[9];
    for (uint32_t index = 0; index < 9; ++index) {
      napi_value value;
      check(napi_get_element(env, arguments[1], index, &value));
      values[index] = string(env, value);
    }
    transfer->path = values[0];
    constexpr auto u32 = std::numeric_limits<uint32_t>::max();
    constexpr auto u64 = std::numeric_limits<uint64_t>::max();
    transfer->frame.sequence = number(values[1], u32);
    transfer->frame.width = number(values[2], u32);
    transfer->frame.height = number(values[3], u32);
    transfer->frame.stride = number(values[4], u32);
    transfer->frame.offset = number(values[5], u32);
    transfer->frame.size = number(values[6], u64);
    transfer->frame.modifier = number(values[7], u64);
    transfer->frame.pixel_format = values[8] == "bgra" ? beam::PixelFormat::bgra
                                   : values[8] == "rgba"
                                       ? beam::PixelFormat::rgba
                                       : static_cast<beam::PixelFormat>(0);
    beam::validate_frame(transfer->frame);
    // Own an fd before leaving Electron's paint callback. Pixel storage remains
    // on the GPU, and the JS owner retains the texture until acknowledgment.
    transfer->descriptor = fcntl(int(descriptor), F_DUPFD_CLOEXEC, 3);
    if (transfer->descriptor < 0)
      throw std::runtime_error("Cannot retain DMA-BUF descriptor");
    napi_value promise, name;
    check(napi_create_promise(env, &transfer->deferred, &promise));
    check(napi_create_string_utf8(env, "beam:gpu-descriptor", NAPI_AUTO_LENGTH,
                                  &name));
    check(napi_create_async_work(env, nullptr, name, execute, complete,
                                 transfer.get(), &transfer->work));
    check(napi_queue_async_work(env, transfer->work));
    transfer.release();
    return promise;
  } catch (const std::exception &error) {
    if (transfer->work)
      napi_delete_async_work(env, transfer->work);
    bool pending = false;
    napi_is_exception_pending(env, &pending);
    if (!pending)
      napi_throw_error(env, nullptr, error.what());
    return nullptr;
  }
}
napi_value initialize(napi_env env, napi_value exports) {
  const napi_property_descriptor method{"transfer",   nullptr, send,
                                        nullptr,      nullptr, nullptr,
                                        napi_default, nullptr};
  napi_define_properties(env, exports, 1, &method);
  return exports;
}
} // namespace
NAPI_MODULE(beam_gpu_transport, initialize)
