import { EncodedPacketSink } from 'mediabunny';
import type { AssetDecoder } from './playback-worker-consumers';
import type { PlaybackSeekMode } from './playback-types';

// One demux metadata reader per asset, not per clip. Weak ownership follows the input.
const readers = new WeakMap<AssetDecoder, EncodedPacketSink>();

export async function scrubSourceTime(asset: AssetDecoder, seconds: number, mode: PlaybackSeekMode): Promise<number> {
  if (mode === 'seek') return seconds;
  let reader = readers.get(asset);
  if (!reader) {
    reader = new EncodedPacketSink(asset.sinkTrack!);
    readers.set(asset, reader);
  }
  const key = await reader.getKeyPacket(seconds, { metadataOnly: true });
  // Before the first key packet, the requested timestamp remains the correct seed.
  return key && Number.isFinite(key.timestamp) && key.timestamp <= seconds ? key.timestamp : seconds;
}
