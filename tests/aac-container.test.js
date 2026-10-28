const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareCapturedAudio } = (() => {
    try { return require('../src/js/aac-container.js'); }
    catch (error) { if (error.code === 'MODULE_NOT_FOUND') return {}; throw error; }
})();

// AAC-LC, 24 kHz, mono, one 1024-sample block per ADTS frame.
const frame = (payload) => {
    const length = payload.length + 7;
    return Uint8Array.from([0xff, 0xf1, 0x58, 0x40 | (length >> 11),
        (length >> 3) & 255, ((length & 7) << 5) | 0x1f, 0xfc, ...payload]);
};
const boxes = (bytes, start = 0, end = bytes.length) => {
    const result = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = start; offset < end;) {
        const size = view.getUint32(offset);
        assert.ok(size >= 8 && offset + size <= end, 'valid box boundaries');
        result.push({ type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), offset, size });
        offset += size;
    }
    return result;
};

test('completed variable-size AAC frames gain an exact duration and indexed lossless playback container', async () => {
    assert.equal(typeof prepareCapturedAudio, 'function');
    const input = new Blob([frame([1, 2, 3]), frame([4, 5, 6, 7, 8]), frame([9])], { type: 'audio/aac' });
    const result = await prepareCapturedAudio(input);
    assert.equal(result.duration, 0.128);
    assert.equal(result.blob.type, 'audio/mp4');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const top = boxes(bytes);
    assert.deepEqual(top.map(b => b.type), ['ftyp', 'moov', 'mdat']);
    const data = top[2];
    assert.deepEqual([...bytes.subarray(data.offset + 8)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const child = (parent, type) => boxes(bytes, parent.offset + 8, parent.offset + parent.size).find(b => b.type === type);
    const mdia = child(child(top[1], 'trak'), 'mdia');
    const mdhd = child(mdia, 'mdhd');
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(mdhd.offset + 20), 24000);
    assert.equal(view.getUint32(mdhd.offset + 24), 3072);
    const stbl = child(child(mdia, 'minf'), 'stbl');
    const stco = child(stbl, 'stco');
    assert.equal(view.getUint32(stco.offset + 16), data.offset + 8);
    const stsz = child(stbl, 'stsz');
    assert.equal(view.getUint32(stsz.offset + 16), 3);
    assert.deepEqual([20, 24, 28].map(o => view.getUint32(stsz.offset + o)), [3, 5, 1]);
    const stts = child(stbl, 'stts');
    assert.equal(view.getUint32(stts.offset + 16), 3);
    assert.equal(view.getUint32(stts.offset + 20), 1024);
});

test('truncated, malformed, unsupported, and changing AAC configurations preserve the original capture', async () => {
    assert.equal(typeof prepareCapturedAudio, 'function');
    const good = frame([1, 2]);
    const otherRate = frame([3, 4]);
    otherRate[2] = 0x50; // 44.1 kHz
    const unsupported = frame([5]);
    unsupported[2] = 0x18; // AAC Main
    for (const bytes of [new Uint8Array([1, 2, 3]), good.slice(0, -1),
        new Uint8Array([...good, 0]), new Uint8Array([...good, ...otherRate]), unsupported]) {
        const input = new Blob([bytes], { type: 'audio/aac' });
        const result = await prepareCapturedAudio(input);
        assert.equal(result.blob, input);
        assert.equal(result.duration, 0);
    }
});

test('long captures build their seek index without a frame-count call stack limit', async () => {
    const one = frame([0]);
    const input = new Uint8Array(one.length * 130000);
    for (let offset = 0; offset < input.length; offset += one.length) input.set(one, offset);
    const result = await prepareCapturedAudio(new Blob([input], { type: 'audio/aac' }));
    assert.equal(result.blob.type, 'audio/mp4');
    assert.equal(result.duration, 5546.666666666667);
});
