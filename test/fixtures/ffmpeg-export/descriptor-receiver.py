import array
import json
import os
import socket
import struct
import sys

# Metadata/descriptor transport test only: no video pixel readback in export.
server = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
server.bind(sys.argv[1])
server.listen(1)
print("ready", flush=True)
connection, _ = server.accept()
payload, control, flags, _ = connection.recvmsg(48, socket.CMSG_SPACE(4))
assert not flags and len(control) == 1
descriptors = array.array("i")
descriptors.frombytes(control[0][2])
assert len(descriptors) == 1
descriptor = descriptors[0]
try:
    metadata = list(struct.unpack("=6I2Q2I", payload))
    metadata[7] = str(metadata[7])
    print(json.dumps({"metadata": metadata,
                      "retained": os.pread(descriptor, 16, 0).decode()}), flush=True)
    reply = sys.stdin.readline().strip()
    connection.send(reply.encode())
finally:
    os.close(descriptor)
    connection.close()
    server.close()
