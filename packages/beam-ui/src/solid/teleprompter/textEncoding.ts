/** Counts UTF-8 bytes without relying on a browser TextEncoder in QuickJS. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (const symbol of text) {
    const point = symbol.codePointAt(0)!
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return bytes
}
