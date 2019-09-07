// Copyright (c) 2017 Kichikuou <KichikuouChrome@gmail.com>
// This source code is governed by the MIT License, see the LICENSE file.
import { $ } from './util.js';
import { config } from './config.js';
import { CDImageSource, FileSource, ZipSource, NoGamedataError } from './loadersource.js';
import { addToast } from './toast.js';
import { midiPlayer } from './midi.js';
import { volumeControl } from './volume.js';
class Loader {
    constructor() {
        this.source = null;
        this.installing = false;
        $('#fileselect').addEventListener('change', this.handleFileSelect.bind(this), false);
        document.body.ondragover = this.handleDragOver.bind(this);
        document.body.ondrop = this.handleDrop.bind(this);
    }
    getCDDA(track) {
        return this.source.getCDDA(track);
    }
    reloadImage() {
        return this.source.reloadImage();
    }
    handleFileSelect(evt) {
        let input = evt.target;
        this.handleFiles(input.files);
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
        this.handleFiles(evt.dataTransfer.files);
    }
    async handleFiles(files) {
        if (this.installing || files.length === 0)
            return;
        let hasALD = false;
        let recognized = false;
        for (let file of files) {
            if (this.isImageFile(file)) {
                this.imageFile = file;
                $('#imgReady').classList.remove('notready');
                $('#imgReady').textContent = file.name;
                recognized = true;
            }
            else if (this.isMetadataFile(file)) {
                this.metadataFile = file;
                $('#cueReady').classList.remove('notready');
                $('#cueReady').textContent = file.name;
                recognized = true;
            }
            else if (file.name.toLowerCase().endsWith('.ald')) {
                hasALD = true;
            }
            else if (file.name.toLowerCase().endsWith('.rar')) {
                addToast('展開前のrarファイルは読み込めません。', 'warning');
                recognized = true;
            }
        }
        if (this.imageFile && (this.metadataFile || this.imageFile.name.toLowerCase().endsWith('.iso'))) {
            this.source = new CDImageSource(this.imageFile, this.metadataFile);
        }
        else if (!this.imageFile && !this.metadataFile) {
            if (files.length == 1 && files[0].name.toLowerCase().endsWith('.zip')) {
                this.source = new ZipSource(files[0]);
            }
            else if (hasALD) {
                this.source = new FileSource(files);
            }
        }
        if (!this.source) {
            if (!recognized)
                addToast(files[0].name + ' は認識できない形式です。', 'warning');
            return;
        }
        this.installing = true;
        try {
            await this.source.startLoad();
            loaded(this.source.hasMidi);
        }
        catch (err) {
            if (err instanceof NoGamedataError) {
                ga('send', 'event', 'Loader', 'NoGamedata', err.message);
                addToast('インストールできません。' + err.message, 'warning');
            }
            else {
                ga('send', 'event', 'Loader', 'LoadFailed', err.message);
                addToast('インストールできません。認識できない形式です。', 'warning');
            }
            this.source = null;
        }
        this.installing = false;
    }
    isImageFile(file) {
        let name = file.name.toLowerCase();
        return name.endsWith('.img') || name.endsWith('.mdf') || name.endsWith('.iso');
    }
    isMetadataFile(file) {
        let name = file.name.toLowerCase();
        return name.endsWith('.cue') || name.endsWith('.ccd') || name.endsWith('.mds');
    }
}
export let loader = new Loader();
function loaded(hasMidi) {
    if (hasMidi)
        midiPlayer.init(volumeControl.audioNode());
    $('#xsystem35').hidden = false;
    document.body.classList.add('game');
    $('#toolbar').classList.remove('before-game-start');
    window.onbeforeunload = onBeforeUnload;
    setTimeout(() => {
        if (config.antialias)
            Module.arguments.push('-antialias');
        Module.removeRunDependency('gameFiles');
    }, 0);
}
function onBeforeUnload(e) {
    if (config.unloadConfirmation) {
        e.returnValue = 'セーブしていないデータは失われます。';
        volumeControl.suspendForModalDialog();
    }
}
