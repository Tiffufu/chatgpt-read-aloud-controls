/** Index completed AAC-LC captures without decoding or changing their audio samples. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AEPlayerAacContainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    'use strict';

    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    const bytes = (...values) => Uint8Array.from(values);
    const text = (value) => Uint8Array.from(value, (char) => char.charCodeAt(0));
    const join = (...parts) => {
        const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
        let offset = 0;
        parts.forEach((part) => { output.set(part, offset); offset += part.length; });
        return output;
    };
    const u32 = (...values) => {
        const output = new Uint8Array(values.length * 4);
        const view = new DataView(output.buffer);
        values.forEach((value, index) => view.setUint32(index * 4, value));
        return output;
    };
    const u16 = (...values) => join(...values.map((value) => bytes(value >> 8, value & 255)));
    const box = (type, ...parts) => join(u32(8 + parts.reduce((n, part) => n + part.length, 0)), text(type), ...parts);
    const full = (type, flags, ...parts) => box(type, u32(flags), ...parts);
    const matrix = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

    const prepareCapturedAudio = async (blob) => {
        const unchanged = { blob, duration: 0 };
        if (!blob?.arrayBuffer) return unchanged;
        const data = new Uint8Array(await blob.arrayBuffer());
        const frames = [];
        let offset = 0;
        let payloadSize = 0;
        let frequencyIndex;
        let channels;
        while (offset + 7 <= data.length) {
            const h = data.subarray(offset, offset + 7);
            const frequency = (h[2] >> 2) & 15;
            const channel = ((h[2] & 1) << 2) | (h[3] >> 6);
            const headerSize = (h[1] & 1) ? 7 : 9;
            const size = ((h[3] & 3) << 11) | (h[4] << 3) | (h[5] >> 5);
            // Only the observed AAC-LC, single-block mono/stereo format is remuxed.
            // Other codecs/configurations retain the existing playback path.
            if (h[0] !== 255 || (h[1] & 0xf6) !== 0xf0 || (h[2] >> 6) !== 1
                || !rates[frequency] || rates[frequency] > 48000 || channel < 1 || channel > 2
                || (h[6] & 3) !== 0 || size <= headerSize || offset + size > data.length
                || (frames.length && (frequency !== frequencyIndex || channel !== channels))) return unchanged;
            frequencyIndex = frequency;
            channels = channel;
            frames.push(data.subarray(offset + headerSize, offset + size));
            payloadSize += size - headerSize;
            offset += size;
        }
        if (!frames.length || offset !== data.length) return unchanged;

        const sampleRate = rates[frequencyIndex];
        const sampleCount = frames.length * 1024;
        if (sampleCount > 0xffffffff || payloadSize > 0xffffffff - 8) return unchanged;
        const sampleSizes = new Uint8Array(frames.length * 4);
        const sampleSizeView = new DataView(sampleSizes.buffer);
        frames.forEach((frame, index) => sampleSizeView.setUint32(index * 4, frame.length));
        const ftyp = box('ftyp', text('M4A '), u32(0), text('M4A isommp42'));
        const config = bytes((2 << 3) | (frequencyIndex >> 1), ((frequencyIndex & 1) << 7) | (channels << 3));
        // ISO BMFF AudioSpecificConfig / MPEG-4 Elementary Stream descriptors.
        const specific = join(bytes(5, config.length), config);
        const decoder = join(bytes(4, 13 + specific.length, 0x40, 0x15, 0, 0, 0), u32(0, 0), specific);
        const esds = full('esds', 0, bytes(3, 3 + decoder.length + 3), u16(1), bytes(0), decoder, bytes(6, 1, 2));
        const mp4a = box('mp4a', new Uint8Array(6), u16(1), new Uint8Array(8),
            u16(channels, 16, 0, 0), u32(sampleRate * 65536), esds);
        const makeMoov = (chunkOffset) => box('moov',
            full('mvhd', 0, u32(0, 0, sampleRate, sampleCount, 0x10000), u16(0x100, 0),
                new Uint8Array(8), matrix, new Uint8Array(24), u32(2)),
            box('trak',
                full('tkhd', 7, u32(0, 0, 1, 0, sampleCount), new Uint8Array(8),
                    u16(0, 0, 0x100, 0), matrix, u32(0, 0)),
                box('mdia',
                    full('mdhd', 0, u32(0, 0, sampleRate, sampleCount), u16(0x55c4, 0)),
                    full('hdlr', 0, u32(0), text('soun'), new Uint8Array(12), text('Read Aloud\0')),
                    box('minf', full('smhd', 0, u16(0, 0)),
                        box('dinf', full('dref', 0, u32(1), full('url ', 1))),
                        box('stbl', full('stsd', 0, u32(1), mp4a),
                            full('stts', 0, u32(1, frames.length, 1024)),
                            full('stsc', 0, u32(1, 1, frames.length, 1)),
                            full('stsz', 0, u32(0, frames.length), sampleSizes),
                            full('stco', 0, u32(1, chunkOffset)))))));
        const moov = makeMoov(ftyp.length + makeMoov(0).length + 8);
        const payload = new Uint8Array(payloadSize);
        let written = 0;
        frames.forEach((frame) => { payload.set(frame, written); written += frame.length; });
        return {
            blob: new Blob([ftyp, moov, u32(payloadSize + 8), text('mdat'), payload], { type: 'audio/mp4' }),
            duration: sampleCount / sampleRate
        };
    };

    return Object.freeze({ prepareCapturedAudio });
});
