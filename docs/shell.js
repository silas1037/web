var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let $ = document.querySelector.bind(document);
function readFileAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => { resolve(reader.result); };
        reader.onerror = () => { reject(reader.error); };
        reader.readAsArrayBuffer(blob);
    });
}
function readFileAsText(blob) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onload = () => { resolve(reader.result); };
        reader.onerror = () => { reject(reader.error); };
        reader.readAsText(blob);
    });
}
function ASCIIArrayToString(buffer) {
    return String.fromCharCode.apply(null, buffer);
}
function SJISArrayToString(buffer) {
    if (typeof TextDecoder !== 'undefined')
        return new TextDecoder('shift_jis').decode(buffer);
    let out = [];
    for (let i = 0; i < buffer.byteLength; i++) {
        let c = buffer.getUint8(i);
        if (c >= 0xa0 && c <= 0xdf)
            out.push(0xff60 + c - 0xa0);
        else if (c < 0x80)
            out.push(c);
        else
            out.push(_sjis2unicode(c, buffer.getUint8(++i)));
    }
    return String.fromCharCode.apply(null, out);
}
function openFileInput() {
    return new Promise((resolve) => {
        let input = document.createElement('input');
        input.type = 'file';
        input.addEventListener('change', (evt) => {
            document.body.removeChild(input);
            resolve(input.files[0]);
        });
        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
    });
}
function mkdirIfNotExist(path) {
    try {
        FS.mkdir(path);
    }
    catch (err) {
        if (err.code !== 'EEXIST')
            throw err;
    }
}
/// <reference path="util.ts" />
var CDImage;
(function (CDImage) {
    class ISO9660FileSystem {
        constructor(sectorReader, pvd) {
            this.sectorReader = sectorReader;
            this.pvd = pvd;
            if (this.pvd.type !== 1)
                throw new Error('PVD not found');
        }
        static create(sectorReader) {
            return __awaiter(this, void 0, void 0, function* () {
                let pvd = new PVD(yield sectorReader.readSector(0x10));
                return new ISO9660FileSystem(sectorReader, pvd);
            });
        }
        volumeLabel() {
            return this.pvd.volumeLabel();
        }
        rootDir() {
            return this.pvd.rootDirEnt();
        }
        getDirEnt(name, parent) {
            return __awaiter(this, void 0, void 0, function* () {
                name = name.toLowerCase();
                for (let e of yield this.readDir(parent)) {
                    if (e.name.toLowerCase() === name)
                        return e;
                }
                return null;
            });
        }
        readDir(dirent) {
            return __awaiter(this, void 0, void 0, function* () {
                let sector = dirent.sector;
                let position = 0;
                let length = dirent.size;
                let entries = [];
                let buf;
                while (position < length) {
                    if (position === 0)
                        buf = yield this.sectorReader.readSector(sector);
                    let child = new DirEnt(buf, position);
                    if (child.length === 0) {
                        // Padded end of sector
                        position = 2048;
                    }
                    else {
                        entries.push(child);
                        position += child.length;
                    }
                    if (position > 2048)
                        throw new Error('dirent across sector boundary');
                    if (position === 2048) {
                        sector++;
                        position = 0;
                        length -= 2048;
                    }
                }
                return entries;
            });
        }
        readFile(dirent) {
            return this.sectorReader.readSequentialSectors(dirent.sector, dirent.size);
        }
    }
    CDImage.ISO9660FileSystem = ISO9660FileSystem;
    class PVD {
        constructor(buf) {
            this.buf = buf;
            this.view = new DataView(buf);
        }
        get type() {
            return this.view.getUint8(0);
        }
        volumeLabel() {
            return SJISArrayToString(new DataView(this.buf, 40, 32)).trim();
        }
        rootDirEnt() {
            return new DirEnt(this.buf, 156);
        }
    }
    class DirEnt {
        constructor(buf, offset) {
            this.buf = buf;
            this.offset = offset;
            this.view = new DataView(buf, offset);
        }
        get length() {
            return this.view.getUint8(0);
        }
        get sector() {
            return this.view.getUint32(2, true);
        }
        get size() {
            return this.view.getUint32(10, true);
        }
        get isDirectory() {
            return (this.view.getUint8(25) & 2) !== 0;
        }
        get name() {
            let len = this.view.getUint8(32);
            return SJISArrayToString(new DataView(this.buf, this.offset + 33, len)).split(';')[0];
        }
    }
    CDImage.DirEnt = DirEnt;
    function createReader(img, cue) {
        return __awaiter(this, void 0, void 0, function* () {
            if (cue.name.endsWith('.cue')) {
                let reader = new ImgCueReader(img);
                yield reader.parseCue(cue);
                return reader;
            }
            else {
                let reader = new MdfMdsReader(img);
                yield reader.parseMds(cue);
                return reader;
            }
        });
    }
    CDImage.createReader = createReader;
    class ImageReaderBase {
        constructor(image) {
            this.image = image;
        }
        readSequential(startOffset, bytesToRead, blockSize, sectorSize, sectorOffset) {
            return __awaiter(this, void 0, void 0, function* () {
                let sectors = Math.ceil(bytesToRead / sectorSize);
                let blob = this.image.slice(startOffset, startOffset + sectors * blockSize);
                let buf = yield readFileAsArrayBuffer(blob);
                let bufs = [];
                for (let i = 0; i < sectors; i++) {
                    bufs.push(new Uint8Array(buf, i * blockSize + sectorOffset, Math.min(bytesToRead, sectorSize)));
                    bytesToRead -= sectorSize;
                }
                return bufs;
            });
        }
        resetImage(image) {
            this.image = image;
        }
    }
    class ImgCueReader extends ImageReaderBase {
        constructor(img) {
            super(img);
        }
        readSector(sector) {
            let start = sector * 2352 + 16;
            let end = start + 2048;
            return readFileAsArrayBuffer(this.image.slice(start, end));
        }
        readSequentialSectors(startSector, length) {
            return this.readSequential(startSector * 2352, length, 2352, 2048, 16);
        }
        parseCue(cueFile) {
            return __awaiter(this, void 0, void 0, function* () {
                let lines = (yield readFileAsText(cueFile)).split('\n');
                this.tracks = [];
                let currentTrack = null;
                for (let line of lines) {
                    let fields = line.trim().split(/\s+/);
                    switch (fields[0]) {
                        case 'TRACK':
                            currentTrack = Number(fields[1]);
                            this.tracks[currentTrack] = { type: fields[2], index: [] };
                            break;
                        case 'INDEX':
                            if (currentTrack)
                                this.tracks[currentTrack].index[Number(fields[1])] = fields[2];
                            break;
                        default:
                    }
                }
            });
        }
        maxTrack() {
            return this.tracks.length - 1;
        }
        extractTrack(track) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.tracks[track] || this.tracks[track].type !== 'AUDIO')
                    return;
                let start = this.indexToSector(this.tracks[track].index[1]) * 2352;
                let end;
                if (this.tracks[track + 1]) {
                    let index = this.tracks[track + 1].index[0] || this.tracks[track + 1].index[1];
                    end = this.indexToSector(index) * 2352;
                }
                else {
                    end = this.image.size;
                }
                let size = end - start;
                return new Blob([createWaveHeader(size), this.image.slice(start, start + size)], { type: 'audio/wav' });
            });
        }
        indexToSector(index) {
            let msf = index.split(':').map(Number);
            return msf[0] * 60 * 75 + msf[1] * 75 + msf[2];
        }
    }
    var MdsTrackMode;
    (function (MdsTrackMode) {
        MdsTrackMode[MdsTrackMode["Audio"] = 169] = "Audio";
        MdsTrackMode[MdsTrackMode["Mode1"] = 170] = "Mode1";
    })(MdsTrackMode || (MdsTrackMode = {}));
    class MdfMdsReader extends ImageReaderBase {
        constructor(mdf) {
            super(mdf);
        }
        parseMds(mdsFile) {
            return __awaiter(this, void 0, void 0, function* () {
                let buf = yield readFileAsArrayBuffer(mdsFile);
                let signature = ASCIIArrayToString(new Uint8Array(buf, 0, 16));
                if (signature !== 'MEDIA DESCRIPTOR')
                    throw new Error(mdsFile.name + ': not a mds file');
                let header = new DataView(buf, 0, 0x70);
                let entries = header.getUint8(0x62);
                this.tracks = [];
                for (let i = 0; i < entries; i++) {
                    let trackData = new DataView(buf, 0x70 + i * 0x50, 0x50);
                    let extraData = new DataView(buf, 0x70 + entries * 0x50 + i * 8, 8);
                    let mode = trackData.getUint8(0x00);
                    let track = trackData.getUint8(0x04);
                    let sectorSize = trackData.getUint16(0x10, true);
                    let offset = trackData.getUint32(0x28, true); // >4GB offset is not supported.
                    let sectors = extraData.getUint32(0x4, true);
                    if (track < 100)
                        this.tracks[track] = { mode, sectorSize, offset, sectors };
                }
                if (this.tracks[1].mode !== MdsTrackMode.Mode1)
                    throw new Error('track 1 is not mode1');
            });
        }
        readSector(sector) {
            let start = sector * this.tracks[1].sectorSize + 16;
            let end = start + 2048;
            return readFileAsArrayBuffer(this.image.slice(start, end));
        }
        readSequentialSectors(startSector, length) {
            let track = this.tracks[1];
            return this.readSequential(track.offset + startSector * track.sectorSize, length, track.sectorSize, 2048, 16);
        }
        maxTrack() {
            return this.tracks.length - 1;
        }
        extractTrack(track) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.tracks[track] || this.tracks[track].mode !== MdsTrackMode.Audio)
                    return;
                let size = this.tracks[track].sectors * 2352;
                let chunks = yield this.readSequential(this.tracks[track].offset, size, this.tracks[track].sectorSize, 2352, 0);
                return new Blob([createWaveHeader(size)].concat(chunks), { type: 'audio/wav' });
            });
        }
    }
    function createWaveHeader(size) {
        let buf = new ArrayBuffer(44);
        let view = new DataView(buf);
        view.setUint32(0, 0x52494646, false); // 'RIFF'
        view.setUint32(4, size + 36, true); // filesize - 8
        view.setUint32(8, 0x57415645, false); // 'WAVE'
        view.setUint32(12, 0x666D7420, false); // 'fmt '
        view.setUint32(16, 16, true); // size of fmt chunk
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, 2, true); // stereo
        view.setUint32(24, 44100, true); // sampling rate
        view.setUint32(28, 176400, true); // bytes/sec
        view.setUint16(32, 4, true); // block size
        view.setUint16(34, 16, true); // bit/sample
        view.setUint32(36, 0x64617461, false); // 'data'
        view.setUint32(40, size, true); // data size
        return buf;
    }
})(CDImage || (CDImage = {}));
/// <reference path="util.ts" />
/// <reference path="cdimage.ts" />
var xsystem35;
(function (xsystem35) {
    class ImageLoader {
        constructor(shell) {
            this.shell = shell;
            $('#fileselect').addEventListener('change', this.handleFileSelect.bind(this), false);
            document.body.ondragover = this.handleDragOver.bind(this);
            document.body.ondrop = this.handleDrop.bind(this);
        }
        getCDDA(track) {
            return this.imageReader.extractTrack(track);
        }
        reloadImage() {
            return openFileInput().then((file) => {
                this.imageReader.resetImage(file);
            });
        }
        handleFileSelect(evt) {
            let input = evt.target;
            let files = input.files;
            for (let i = 0; i < files.length; i++)
                this.setFile(files[i]);
            input.value = '';
        }
        handleDragOver(evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy';
        }
        handleDrop(evt) {
            evt.stopPropagation();
            evt.preventDefault();
            let files = evt.dataTransfer.files;
            for (let i = 0; i < files.length; i++)
                this.setFile(files[i]);
        }
        setFile(file) {
            return __awaiter(this, void 0, void 0, function* () {
                let name = file.name.toLowerCase();
                if (name.endsWith('.img') || name.endsWith('.mdf')) {
                    this.imgFile = file;
                    $('#imgReady').classList.remove('notready');
                    $('#imgReady').textContent = file.name;
                }
                else if (name.endsWith('.cue') || name.endsWith('.mds')) {
                    this.cueFile = file;
                    $('#cueReady').classList.remove('notready');
                    $('#cueReady').textContent = file.name;
                }
                if (this.imgFile && this.cueFile) {
                    this.imageReader = yield CDImage.createReader(this.imgFile, this.cueFile);
                    this.startLoad();
                }
            });
        }
        extractFile(isofs, entry, buf, offset) {
            return __awaiter(this, void 0, void 0, function* () {
                let ptr = 0;
                for (let chunk of yield isofs.readFile(entry)) {
                    buf.set(chunk, ptr + offset);
                    ptr += chunk.byteLength;
                }
                if (ptr !== entry.size)
                    throw new Error('expected ' + entry.size + ' bytes, but read ' + ptr + 'bytes');
            });
        }
        startLoad() {
            return __awaiter(this, void 0, void 0, function* () {
                let isofs = yield CDImage.ISO9660FileSystem.create(this.imageReader);
                // this.walk(isofs, isofs.rootDir(), '/');
                let gamedata = (yield isofs.getDirEnt('gamedata', isofs.rootDir())) ||
                    (yield isofs.getDirEnt('mugen', isofs.rootDir()));
                if (!gamedata) {
                    this.shell.addToast('インストールできません。イメージ内にGAMEDATAフォルダが見つかりません。', 'danger');
                    return;
                }
                let isSystem3 = !!(yield isofs.getDirEnt('system3.exe', gamedata));
                xsystem35.shell.loadModule(isSystem3 ? 'system3' : 'xsystem35');
                yield xsystem35.fileSystemReady;
                this.shell.loadStarted();
                let aldFiles = [];
                for (let e of yield isofs.readDir(gamedata)) {
                    if (!e.name.toLowerCase().endsWith(isSystem3 ? '.dat' : '.ald'))
                        continue;
                    // Store contents in the emscripten heap, so that it can be mmap-ed without copying
                    let ptr = Module.getMemory(e.size);
                    yield this.extractFile(isofs, e, Module.HEAPU8, ptr);
                    FS.writeFile(e.name, Module.HEAPU8.subarray(ptr, ptr + e.size), { encoding: 'binary', canOwn: true });
                    aldFiles.push(e.name);
                }
                if (isSystem3) {
                    let savedir = '/save/' + isofs.volumeLabel();
                    Module.arguments.push('-savedir', savedir + '/');
                    xsystem35.saveDirReady.then(() => { mkdirIfNotExist(savedir); });
                }
                else {
                    FS.writeFile('xsystem35.gr', this.createGr(aldFiles));
                    FS.writeFile('.xsys35rc', xsystem35.xsys35rc);
                }
                this.shell.loaded();
            });
        }
        createGr(files) {
            const resourceType = {
                d: 'Data', g: 'Graphics', m: 'Midi', r: 'Resource', s: 'Scenario', w: 'Wave',
            };
            let basename;
            let lines = [];
            for (let name of files) {
                let type = name.charAt(name.length - 6).toLowerCase();
                let id = name.charAt(name.length - 5);
                basename = name.slice(0, -6);
                lines.push(resourceType[type] + id.toUpperCase() + ' ' + name);
            }
            for (let i = 0; i < 26; i++) {
                let id = String.fromCharCode(65 + i);
                lines.push('Save' + id + ' save/' + basename + 's' + id.toLowerCase() + '.asd');
            }
            return lines.join('\n') + '\n';
        }
        // For debug
        walk(isofs, dir, dirname) {
            return __awaiter(this, void 0, void 0, function* () {
                for (let e of yield isofs.readDir(dir)) {
                    if (e.name !== '\0' && e.name !== '\x01') {
                        console.log(dirname + e.name);
                        if (e.isDirectory)
                            this.walk(isofs, e, dirname + e.name + '/');
                    }
                }
            });
        }
    }
    xsystem35.ImageLoader = ImageLoader;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
var xsystem35;
(function (xsystem35) {
    class Settings {
        constructor() {
            $('#settings-button').addEventListener('click', this.openModal.bind(this));
            $('#settings-close').addEventListener('click', this.closeModal.bind(this));
            this.keyDownHandler = (ev) => {
                if (ev.keyCode === 27)
                    this.closeModal();
            };
            $('.modal-overlay').addEventListener('click', this.closeModal.bind(this));
            $('#downloadSaveData').addEventListener('click', this.downloadSaveData.bind(this));
            $('#uploadSaveData').addEventListener('click', this.uploadSaveData.bind(this));
            this.checkSaveData();
        }
        openModal() {
            $('#settings-modal').classList.add('active');
            document.addEventListener('keydown', this.keyDownHandler);
        }
        closeModal() {
            $('#settings-modal').classList.remove('active');
            document.removeEventListener('keydown', this.keyDownHandler);
        }
        checkSaveData() {
            xsystem35.saveDirReady.then(() => {
                if (FS.readdir('/save').some((name) => name.toLowerCase().endsWith('.asd')))
                    $('#downloadSaveData').removeAttribute('disabled');
            });
        }
        downloadSaveData() {
            return __awaiter(this, void 0, void 0, function* () {
                let zip = new JSZip();
                this.storeZip('/save', zip.folder('save'));
                let blob = yield zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                if (navigator.msSaveBlob) {
                    navigator.msSaveBlob(blob, 'savedata.zip');
                }
                else {
                    let elem = document.createElement('a');
                    elem.setAttribute('download', 'savedata.zip');
                    elem.setAttribute('href', URL.createObjectURL(blob));
                    document.body.appendChild(elem);
                    elem.click();
                    setTimeout(() => { document.body.removeChild(elem); }, 5000);
                }
            });
        }
        storeZip(dir, zip) {
            for (let name of FS.readdir(dir)) {
                let path = dir + '/' + name;
                if (name[0] === '.') {
                    continue;
                }
                else if (FS.isDir(FS.stat(path).mode)) {
                    this.storeZip(path, zip.folder(name));
                }
                else if (!name.toLowerCase().endsWith('.asd.')) {
                    let content = FS.readFile(path, { encoding: 'binary' });
                    zip.file(name, content);
                }
            }
        }
        uploadSaveData() {
            openFileInput().then((file) => {
                this.extractSaveData(file);
            });
        }
        extractSaveData(file) {
            return __awaiter(this, void 0, void 0, function* () {
                function addSaveFile(path, content) {
                    FS.writeFile(path, new Uint8Array(content), { encoding: 'binary' });
                }
                try {
                    yield xsystem35.saveDirReady;
                    if (file.name.toLowerCase().endsWith('.asd')) {
                        addSaveFile('/save/' + file.name, yield readFileAsArrayBuffer(file));
                    }
                    else {
                        let zip = new JSZip();
                        yield zip.loadAsync(yield readFileAsArrayBuffer(file));
                        let entries = [];
                        zip.folder('save').forEach((path, z) => { entries.push(z); });
                        for (let z of entries) {
                            if (z.dir)
                                mkdirIfNotExist('/' + z.name.slice(0, -1));
                            else
                                addSaveFile('/' + z.name, yield z.async('arraybuffer'));
                        }
                    }
                    xsystem35.shell.syncfs(0);
                    xsystem35.shell.addToast('セーブデータの復元に成功しました。', 'success');
                    this.checkSaveData();
                }
                catch (err) {
                    xsystem35.shell.addToast('セーブデータを復元できませんでした。', 'danger');
                    console.warn(err);
                }
            });
        }
    }
    xsystem35.Settings = Settings;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
var xsystem35;
(function (xsystem35) {
    class ZoomManager {
        constructor() {
            this.canvas = $('#canvas');
            this.zoomSelect = $('#zoom');
            this.pixelateCheckbox = $('#pixelate');
            this.zoomSelect.addEventListener('change', this.handleZoom.bind(this));
            this.zoomSelect.value = localStorage.getItem('zoom') || 'fit';
            if (CSS.supports('image-rendering', 'pixelated') || CSS.supports('image-rendering', '-moz-crisp-edges')) {
                this.pixelateCheckbox.addEventListener('change', this.handlePixelate.bind(this));
                if (localStorage.getItem('pixelate') === 'true') {
                    this.pixelateCheckbox.checked = true;
                    this.handlePixelate();
                }
            }
            else {
                this.pixelateCheckbox.setAttribute('disabled', 'true');
            }
        }
        handleZoom() {
            let value = this.zoomSelect.value;
            localStorage.setItem('zoom', value);
            let navbarStyle = $('.navbar').style;
            if (value === 'fit') {
                $('#xsystem35').classList.add('fit');
                navbarStyle.maxWidth = 'none';
                this.canvas.style.width = null;
            }
            else {
                $('#xsystem35').classList.remove('fit');
                let ratio = Number(value);
                navbarStyle.maxWidth = this.canvas.style.width = this.canvas.width * ratio + 'px';
            }
        }
        handlePixelate() {
            localStorage.setItem('pixelate', String(this.pixelateCheckbox.checked));
            if (this.pixelateCheckbox.checked)
                this.canvas.classList.add('pixelated');
            else
                this.canvas.classList.remove('pixelated');
        }
    }
    xsystem35.ZoomManager = ZoomManager;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
var xsystem35;
(function (xsystem35) {
    class VolumeControl {
        constructor() {
            this.vol = Number(localStorage.getItem('volume') || 1);
            this.muted = false;
            this.elem = $('#volume-control');
            this.icon = $('#volume-control-icon');
            this.slider = $('#volume-control-slider');
            this.slider.value = String(Math.round(this.vol * 100));
            this.icon.addEventListener('click', this.onIconClicked.bind(this));
            this.slider.addEventListener('input', this.onSliderValueChanged.bind(this));
            this.slider.addEventListener('change', this.onSliderValueSettled.bind(this));
        }
        volume() {
            return this.muted ? 0 : parseInt(this.slider.value, 10) / 100;
        }
        addEventListener(handler) {
            this.elem.addEventListener('volumechange', handler);
        }
        hideSlider() {
            this.slider.hidden = true;
        }
        onIconClicked(e) {
            this.muted = !this.muted;
            if (this.muted) {
                this.icon.classList.remove('fa-volume-up');
                this.icon.classList.add('fa-volume-off');
                this.slider.value = '0';
            }
            else {
                this.icon.classList.remove('fa-volume-off');
                this.icon.classList.add('fa-volume-up');
                this.slider.value = String(Math.round(this.vol * 100));
            }
            this.dispatchEvent();
        }
        onSliderValueChanged(e) {
            this.vol = parseInt(this.slider.value, 10) / 100;
            if (this.vol > 0 && this.muted) {
                this.muted = false;
                this.icon.classList.remove('fa-volume-off');
                this.icon.classList.add('fa-volume-up');
            }
            this.dispatchEvent();
        }
        onSliderValueSettled(e) {
            localStorage.setItem('volume', this.vol + '');
        }
        dispatchEvent() {
            let event = new CustomEvent('volumechange', { detail: this.volume() });
            this.elem.dispatchEvent(event);
        }
    }
    xsystem35.VolumeControl = VolumeControl;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
/// <reference path="volume.ts" />
var xsystem35;
(function (xsystem35) {
    class CDPlayer {
        constructor(imageLoader, volumeControl) {
            this.imageLoader = imageLoader;
            this.audio = $('audio');
            // Volume control of <audio> is not supported in iOS
            this.audio.volume = 0.5;
            this.isVolumeSupported = this.audio.volume !== 1;
            this.blobCache = [];
            volumeControl.addEventListener(this.onVolumeChanged.bind(this));
            this.audio.volume = volumeControl.volume();
            this.audio.addEventListener('error', this.onAudioError.bind(this));
            this.removeUserGestureRestriction();
            if (!this.isVolumeSupported) {
                volumeControl.hideSlider();
                if (this.audio.volume === 0)
                    this.unmute = () => { };
            }
            document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
        }
        play(track, loop) {
            this.currentTrack = track;
            if (this.unmute) {
                this.unmute = () => { this.play(track, loop); };
                return;
            }
            if (this.blobCache[track]) {
                this.startPlayback(this.blobCache[track], loop);
                return;
            }
            this.audio.currentTime = 0;
            this.imageLoader.getCDDA(track).then((blob) => {
                this.blobCache[track] = blob;
                this.startPlayback(blob, loop);
            });
        }
        stop() {
            this.audio.pause();
            this.currentTrack = null;
            if (this.unmute)
                this.unmute = () => { };
        }
        getPosition() {
            if (!this.currentTrack)
                return 0;
            let time = Math.round(this.audio.currentTime * 75);
            if (this.unmute || this.audio.error)
                time += 750; // unblock Kichikuou OP
            return this.currentTrack | time << 8;
        }
        startPlayback(blob, loop) {
            this.audio.setAttribute('src', URL.createObjectURL(blob));
            this.audio.loop = (loop !== 0);
            this.audio.load();
            this.audio.play();
        }
        onVisibilityChange() {
            if (document.hidden)
                this.blobCache = [];
        }
        onVolumeChanged(evt) {
            if (this.isVolumeSupported) {
                this.audio.volume = evt.detail;
                return;
            }
            let muted = evt.detail === 0;
            if (!!this.unmute === muted)
                return;
            if (muted) {
                this.audio.pause();
                this.unmute = () => { this.audio.play(); };
            }
            else {
                let unmute = this.unmute;
                this.unmute = null;
                unmute();
            }
        }
        onAudioError(err) {
            let clone = document.importNode($('#cdda-error').content, true);
            let toast = xsystem35.shell.addToast(clone, 'danger');
            toast.querySelector('.cdda-reload-button').addEventListener('click', () => {
                this.imageLoader.reloadImage().then(() => {
                    this.play(this.currentTrack, this.audio.loop ? 1 : 0);
                    toast.querySelector('.btn-clear').click();
                });
            });
        }
        removeUserGestureRestriction() {
            let hanlder = () => {
                if (!this.currentTrack) {
                    this.audio.load();
                    console.log('CDDA unlocked');
                }
                window.removeEventListener('touchend', hanlder);
            };
            window.addEventListener('touchend', hanlder);
        }
    }
    xsystem35.CDPlayer = CDPlayer;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
/// <reference path="volume.ts" />
var xsystem35;
(function (xsystem35) {
    class AudioManager {
        constructor(volumeControl) {
            if (typeof (AudioContext) !== 'undefined') {
                this.context = new AudioContext();
            }
            else if (typeof (webkitAudioContext) !== 'undefined') {
                this.context = new webkitAudioContext();
                this.isSafari = true;
                this.removeUserGestureRestriction();
            }
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.slots = [];
            this.bufCache = [];
            volumeControl.addEventListener(this.onVolumeChanged.bind(this));
            this.masterGain.gain.value = volumeControl.volume();
            document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
        }
        removeUserGestureRestriction() {
            let hanlder = () => {
                let src = this.context.createBufferSource();
                src.buffer = this.context.createBuffer(1, 1, 22050);
                src.connect(this.context.destination);
                src.start();
                console.log('AudioContext unlocked');
                window.removeEventListener('touchend', hanlder);
            };
            window.addEventListener('touchend', hanlder);
        }
        load(no) {
            let buf = this.getWave(no);
            if (!buf)
                return Promise.reject('Failed to open wave ' + no);
            let decoded;
            if (this.isSafari) {
                decoded = new Promise((resolve, reject) => {
                    this.context.decodeAudioData(buf, resolve, reject);
                });
            }
            else {
                decoded = this.context.decodeAudioData(buf);
            }
            return decoded.then((audioBuf) => {
                this.bufCache[no] = audioBuf;
                return audioBuf;
            });
        }
        getWave(no) {
            let dfile = _ald_getdata(2 /* DRIFILE_WAVE */, no - 1);
            if (!dfile)
                return null;
            let ptr = Module.getValue(dfile + 8, '*');
            let size = Module.getValue(dfile, 'i32');
            let buf = Module.HEAPU8.buffer.slice(ptr, ptr + size);
            _ald_freedata(dfile);
            return buf;
        }
        pcm_load(slot, no) {
            EmterpreterAsync.handle((resume) => {
                this.pcm_stop(slot);
                if (this.bufCache[no]) {
                    this.slots[slot] = new PCMSoundSimple(this.masterGain, this.bufCache[no]);
                    return resume();
                }
                this.load(no).then((audioBuf) => {
                    this.slots[slot] = new PCMSoundSimple(this.masterGain, audioBuf);
                    resume();
                });
            });
        }
        pcm_load_mixlr(slot, noL, noR) {
            EmterpreterAsync.handle((resume) => {
                this.pcm_stop(slot);
                if (this.bufCache[noL] && this.bufCache[noR]) {
                    this.slots[slot] = new PCMSoundMixLR(this.masterGain, this.bufCache[noL], this.bufCache[noR]);
                    return resume();
                }
                let ps = [
                    this.bufCache[noL] ? Promise.resolve(this.bufCache[noL]) : this.load(noL),
                    this.bufCache[noR] ? Promise.resolve(this.bufCache[noR]) : this.load(noR),
                ];
                Promise.all(ps).then((bufs) => {
                    this.slots[slot] = new PCMSoundMixLR(this.masterGain, bufs[0], bufs[1]);
                    resume();
                });
            });
        }
        pcm_start(slot, loop) {
            if (this.slots[slot]) {
                this.slots[slot].start(loop);
                return 1;
            }
            return 0;
        }
        pcm_stop(slot) {
            if (!this.slots[slot])
                return 0;
            this.slots[slot].stop();
            this.slots[slot] = null;
            return 1;
        }
        pcm_fadeout(slot, msec) {
            if (!this.slots[slot])
                return 0;
            this.slots[slot].fadeout(msec);
            return 1;
        }
        pcm_getpos(slot) {
            if (!this.slots[slot])
                return 0;
            return this.slots[slot].getPosition() * 1000;
        }
        pcm_setvol(slot, vol) {
            if (!this.slots[slot])
                return 0;
            this.slots[slot].setGain(vol / 100);
            return 1;
        }
        pcm_getwavelen(slot) {
            if (!this.slots[slot])
                return 0;
            return this.slots[slot].duration * 1000;
        }
        pcm_isplaying(slot) {
            if (!this.slots[slot])
                return 0;
            return this.slots[slot].isPlaying() ? 1 : 0;
        }
        onVisibilityChange() {
            if (document.hidden)
                this.bufCache = [];
        }
        onVolumeChanged(evt) {
            this.masterGain.gain.value = evt.detail;
        }
    }
    xsystem35.AudioManager = AudioManager;
    class PCMSound {
        constructor(dst) {
            this.dst = dst;
            this.context = dst.context;
            this.gain = this.context.createGain();
            this.gain.connect(dst);
        }
        setGain(gain) {
            this.gain.gain.value = gain;
        }
        fadeout(msec) {
            this.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + msec / 1000);
        }
        getPosition() {
            if (!this.startTime)
                return 0;
            return this.context.currentTime - this.startTime;
        }
        isPlaying() {
            return !!this.startTime;
        }
    }
    class PCMSoundSimple extends PCMSound {
        constructor(dst, buf) {
            super(dst);
            this.node = this.context.createBufferSource();
            this.node.buffer = buf;
            this.node.connect(this.gain);
            this.node.onended = this.onended.bind(this);
        }
        start(loop) {
            if (loop === 0)
                this.node.loop = true;
            else if (loop !== 1)
                console.warn('Unsupported PCM loop count ' + loop);
            this.node.start();
            this.startTime = this.context.currentTime;
        }
        stop() {
            if (this.startTime) {
                this.node.stop();
                this.startTime = null;
            }
        }
        get duration() {
            return this.node.buffer.duration;
        }
        onended() {
            this.startTime = null;
        }
    }
    class PCMSoundMixLR extends PCMSound {
        constructor(dst, lbuf, rbuf) {
            super(dst);
            this.endCount = 0;
            this.lsrc = this.context.createBufferSource();
            this.rsrc = this.context.createBufferSource();
            this.lsrc.buffer = lbuf;
            this.rsrc.buffer = rbuf;
            let merger = this.context.createChannelMerger(2);
            merger.connect(this.gain);
            this.lsrc.connect(merger, 0, 0);
            this.rsrc.connect(merger, 0, 1);
            this.lsrc.onended = this.rsrc.onended = this.onended.bind(this);
        }
        start(loop) {
            if (loop !== 1)
                console.warn('PCMSoundMixLR: loop is not supported ' + loop);
            this.lsrc.start();
            this.rsrc.start();
            this.startTime = this.context.currentTime;
        }
        stop() {
            if (this.startTime) {
                this.lsrc.stop();
                this.rsrc.stop();
                this.startTime = null;
            }
        }
        get duration() {
            return Math.max(this.lsrc.buffer.duration, this.rsrc.buffer.duration);
        }
        onended() {
            this.endCount++;
            if (this.endCount === 2)
                this.startTime = null;
        }
    }
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
var xsystem35;
(function (xsystem35) {
    class ToolBar {
        constructor() {
            this.toolbar = $('#toolbar');
            this.handler = $('#toolbar-handler');
            $('#screenshot-button').addEventListener('click', this.saveScreenshot.bind(this));
        }
        setCloseable() {
            this.handler.hidden = false;
            this.handler.addEventListener('click', this.open.bind(this));
            $('#toolbar-close-button').addEventListener('click', this.close.bind(this));
            this.toolbar.classList.add('closeable');
            this.close();
        }
        open() {
            this.toolbar.classList.remove('closed');
            this.handler.hidden = true;
        }
        close() {
            this.toolbar.classList.add('closed');
            this.handler.hidden = false;
        }
        saveScreenshot() {
            return __awaiter(this, void 0, void 0, function* () {
                let pixels = _sdl_getDisplaySurface();
                let canvas = document.createElement('canvas');
                canvas.width = Module.canvas.width;
                canvas.height = Module.canvas.height;
                let ctx = canvas.getContext('2d');
                let image = ctx.createImageData(canvas.width, canvas.height);
                let buffer = image.data;
                let num = image.data.length;
                for (let dst = 0; dst < num; dst += 4) {
                    buffer[dst] = Module.HEAPU8[pixels + 2];
                    buffer[dst + 1] = Module.HEAPU8[pixels + 1];
                    buffer[dst + 2] = Module.HEAPU8[pixels];
                    buffer[dst + 3] = 0xff;
                    pixels += 4;
                }
                ctx.putImageData(image, 0, 0);
                let url;
                if (canvas.toBlob) {
                    let blob = yield new Promise((resolve) => canvas.toBlob(resolve));
                    url = URL.createObjectURL(blob);
                }
                else if (canvas.msToBlob) {
                    let blob = canvas.msToBlob();
                    navigator.msSaveBlob(blob, 'screenshot.png');
                    return;
                }
                else {
                    url = canvas.toDataURL();
                }
                let elem = document.createElement('a');
                elem.setAttribute('download', 'screenshot.png');
                elem.setAttribute('href', url);
                elem.setAttribute('target', '_blank'); // Unless this, iOS safari replaces current page
                document.body.appendChild(elem);
                elem.click();
                setTimeout(() => { document.body.removeChild(elem); }, 5000);
            });
        }
    }
    xsystem35.ToolBar = ToolBar;
})(xsystem35 || (xsystem35 = {}));
/// <reference path="util.ts" />
/// <reference path="loader.ts" />
/// <reference path="settings.ts" />
/// <reference path="zoom.ts" />
/// <reference path="volume.ts" />
/// <reference path="cdda.ts" />
/// <reference path="audio.ts" />
/// <reference path="toolbar.ts" />
var xsystem35;
(function (xsystem35) {
    const Font = { url: 'fonts/MTLc3m.ttf', fname: 'MTLc3m.ttf' };
    xsystem35.xsys35rc = [
        'font_device: ttf',
        'ttfont_mincho: ' + Font.fname,
        'ttfont_gothic: ' + Font.fname, '',
    ].join('\n');
    class System35Shell {
        constructor() {
            this.status = document.getElementById('status');
            this.parseParams(location.search.slice(1));
            this.initModule();
            this.setStatus('Downloading...');
            window.onerror = () => {
                this.setStatus('Exception thrown, see JavaScript console');
                this.setStatus = (text) => {
                    if (text)
                        Module.printErr('[post-exception status] ' + text);
                };
            };
            this.imageLoader = new xsystem35.ImageLoader(this);
            this.volumeControl = new xsystem35.VolumeControl();
            xsystem35.cdPlayer = new xsystem35.CDPlayer(this.imageLoader, this.volumeControl);
            this.zoom = new xsystem35.ZoomManager();
            this.toolbar = new xsystem35.ToolBar();
            this.antialiasCheckbox = $('#antialias');
            this.antialiasCheckbox.addEventListener('change', this.antialiasChanged.bind(this));
            this.antialiasCheckbox.checked = localStorage.getItem('antialias') !== 'false';
            xsystem35.audio = new xsystem35.AudioManager(this.volumeControl);
            xsystem35.settings = new xsystem35.Settings();
        }
        parseParams(searchParams) {
            if (typeof URLSearchParams !== 'undefined') {
                this.params = new URLSearchParams(searchParams);
                return;
            }
            // For Edge
            this.params = new Map();
            if (window.location.search.length > 1) {
                for (let item of searchParams.split('&')) {
                    let [key, value] = item.split('=');
                    this.params.set(key, value);
                }
            }
        }
        initModule() {
            let fsReady;
            xsystem35.fileSystemReady = new Promise((resolve) => { fsReady = resolve; });
            let idbfsReady;
            xsystem35.saveDirReady = new Promise((resolve) => { idbfsReady = resolve; });
            Module.arguments = [];
            for (let [name, val] of this.params) {
                if (name.startsWith('-')) {
                    Module.arguments.push(name);
                    if (val)
                        Module.arguments.push(val);
                }
            }
            Module.print = Module.printErr = console.log.bind(console);
            Module.setWindowTitle = (title) => {
                let colon = title.indexOf(':');
                if (colon !== -1)
                    $('.navbar-brand').textContent = title.slice(colon + 1);
            };
            Module.canvas = document.getElementById('canvas');
            Module.setStatus = this.setStatus.bind(this);
            Module.preRun = [
                () => { Module.addRunDependency('gameFiles'); },
                fsReady,
                function loadFont() {
                    FS.createPreloadedFile('/', Font.fname, Font.url, true, false);
                },
                function prepareSaveDir() {
                    FS.mkdir('/save');
                    FS.mount(IDBFS, {}, '/save');
                    Module.addRunDependency('syncfs');
                    FS.syncfs(true, (err) => {
                        Module.removeRunDependency('syncfs');
                        idbfsReady();
                    });
                },
            ];
        }
        loadModule(name) {
            let useWasm = typeof WebAssembly === 'object' && this.params.get('wasm') !== '0';
            let src = name + (useWasm ? '.js' : '.asm.js');
            let script = document.createElement('script');
            script.src = src;
            script.onerror = () => { this.addToast(src + 'の読み込みに失敗しました。リロードしてください。', 'danger'); };
            document.body.appendChild(script);
        }
        loadStarted() {
            $('#loader').hidden = true;
            document.body.classList.add('bgblack-fade');
            this.toolbar.setCloseable();
        }
        loaded() {
            $('#xsystem35').hidden = false;
            $('#toolbar').classList.remove('before-game-start');
            setTimeout(() => {
                if (this.antialiasCheckbox.checked)
                    Module.arguments.push('-antialias');
                Module.removeRunDependency('gameFiles');
            }, 0);
        }
        setStatus(text) {
            console.log(text);
            this.status.innerHTML = text;
        }
        windowSizeChanged() {
            this.zoom.handleZoom();
        }
        addToast(msg, type) {
            let container = $('.toast-container');
            let div = document.createElement('div');
            div.classList.add('toast');
            if (type)
                div.classList.add('toast-' + type);
            if (typeof msg === 'string')
                div.innerText = msg;
            else
                div.appendChild(msg);
            let btn = document.createElement('button');
            btn.setAttribute('class', 'btn btn-clear float-right');
            function dismiss() { container.removeChild(div); }
            btn.addEventListener('click', dismiss);
            if (type !== 'danger')
                setTimeout(dismiss, 5000);
            div.insertBefore(btn, div.firstChild);
            container.insertBefore(div, container.firstChild);
            return div;
        }
        syncfs(timeout = 100) {
            window.clearTimeout(this.fsyncTimer);
            this.fsyncTimer = window.setTimeout(() => {
                FS.syncfs(false, (err) => {
                    if (err)
                        console.log('FS.syncfs error: ', err);
                });
            }, timeout);
        }
        antialiasChanged() {
            localStorage.setItem('antialias', String(this.antialiasCheckbox.checked));
            _ags_setAntialiasedStringMode(this.antialiasCheckbox.checked ? 1 : 0);
        }
    }
    xsystem35.System35Shell = System35Shell;
    xsystem35.shell = new System35Shell();
})(xsystem35 || (xsystem35 = {}));
