import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetDecoder } from '../playback-worker-consumers';
const mocks = vi.hoisted(() => ({ packet: vi.fn(), reader: vi.fn() }));
vi.mock('mediabunny', () => ({ EncodedPacketSink: mocks.reader }));
import { scrubSourceTime } from '../scrub-source-time';

beforeEach(() => {
  mocks.packet.mockReset();
  mocks.reader.mockReset().mockImplementation(function () {
    return { getKeyPacket: mocks.packet };
  });
});
const asset = () => ({ sinkTrack: {} }) as AssetDecoder;
describe('scrub source timestamp', () => {
  it('does not inspect packet metadata for precise seeks', async () => {
    expect(await scrubSourceTime(asset(), 2.396, 'seek')).toBe(2.396);
    expect(mocks.reader).not.toHaveBeenCalled();
  });
  it('requests the preceding key packet and shares the reader across clip instances', async () => {
    const source = asset();
    mocks.packet.mockResolvedValue({ timestamp: 2 });
    expect(await scrubSourceTime(source, 2.396, 'scrub')).toBe(2);
    expect(await scrubSourceTime(source, 2.6, 'scrub')).toBe(2);
    expect(mocks.reader).toHaveBeenCalledOnce();
    expect(mocks.packet).toHaveBeenCalledWith(2.396, { metadataOnly: true });
    await scrubSourceTime(asset(), 2.6, 'scrub');
    expect(mocks.reader).toHaveBeenCalledTimes(2);
  });
  it.each([null, { timestamp: Infinity }, { timestamp: 3 }])(
    'preserves the head timestamp when the index cannot seed it: %s',
    async (packet) => {
      mocks.packet.mockResolvedValue(packet);
      expect(await scrubSourceTime(asset(), 0, 'scrub')).toBe(0);
    },
  );
  it('preserves negative track head timestamps and exact keyframe boundaries', async () => {
    mocks.packet.mockResolvedValueOnce({ timestamp: -0.1 }).mockResolvedValueOnce({ timestamp: 2 });
    const source = asset();
    expect(await scrubSourceTime(source, 0, 'scrub')).toBe(-0.1);
    expect(await scrubSourceTime(source, 2, 'scrub')).toBe(2);
  });
  it('reports unreadable packet metadata instead of fabricating a keyframe', async () => {
    mocks.packet.mockRejectedValue(new Error('metadata damaged'));
    await expect(scrubSourceTime(asset(), 2, 'scrub')).rejects.toThrow('metadata damaged');
  });
});
